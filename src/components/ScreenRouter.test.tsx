// @vitest-environment jsdom

import { act, type ImgHTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteState } from "../types/journey";
import { resetLog } from "../logging";
import type { AuguryArchetypeId } from "../journey_v2";
import {
  roots,
  auguryContent,
  makeMutations,
  makeSite,
  makeStateFor,
  mountRouter,
  click,
  logs,
  fixtureAvatar,
} from "./screen-router-test-fixtures";

const motionPreference = vi.hoisted(() => ({ reduced: false, isPresent: true }));

vi.mock("framer-motion", () => {
  type Props = { children?: ReactNode; [key: string]: unknown };
  return {
    AnimatePresence: ({ children, mode }: { children: ReactNode; mode?: string }) => (
      <div data-animate-presence-mode={mode}>{children}</div>
    ),
    useReducedMotion: () => motionPreference.reduced,
    useIsPresent: () => motionPreference.isPresent,
    motion: {
      div: ({ children, exit, ...props }: Props & { exit?: Record<string, unknown> }) => (
        <div {...props} data-exit-keys={exit === undefined ? undefined : Object.keys(exit).join(" ")}>
          {children}
        </div>
      ),
      img: ({
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...props
      }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => <img {...props} />,
      main: ({ children, ...props }: Props) => <main {...props}>{children}</main>,
      section: ({ children, ...props }: Props) => <section {...props}>{children}</section>,
    },
  };
});

vi.mock("./BattleSiteRoute", () => ({
  BattleSiteRoute: ({ site }: { site: SiteState }) => (
    <div data-testid="battle-site-route" data-site-id={site.id} />
  ),
}));

beforeEach(() => {
  motionPreference.reduced = false;
  motionPreference.isPresent = true;
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.clearAllMocks();
  resetLog();
});

describe("ScreenRouter route transitions", () => {
  it("mounts the next route without waiting and makes an exiting route inert", () => {
    const { container } = mountRouter({ state: makeStateFor(makeSite("Augury")) });
    const presence = container.querySelector("[data-animate-presence-mode]");
    expect(presence?.getAttribute("data-animate-presence-mode")).toBe("sync");
    const screen = container.querySelector<HTMLElement>("[data-journey-screen]");
    expect(screen?.dataset.journeyScreenPresence).toBe("present");
    expect(screen?.style.pointerEvents).toBe("");

    motionPreference.isPresent = false;
    const exiting = mountRouter({ state: makeStateFor(makeSite("Augury")) }).container;
    const frame = exiting.querySelector<HTMLElement>("[data-journey-screen]");
    expect(frame?.dataset.journeyScreenPresence).toBe("exiting");
    expect(frame?.hasAttribute("inert")).toBe(true);
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.style.pointerEvents).toBe("none");
  });

  it("keeps pointer blocking out of the exit animation so a returning route accepts input", () => {
    // A route that comes back before its exit fade ends is the same retained
    // frame. Framer Motion keeps values its exit animation wrote, and the
    // enter target restores only opacity, so the exit target must not write
    // pointer-events; presence alone owns the exiting route's input block.
    const { container } = mountRouter({ state: makeStateFor(makeSite("Augury")) });
    const screen = container.querySelector<HTMLElement>("[data-journey-screen]");
    expect(screen?.getAttribute("data-exit-keys")?.split(" ")).not.toContain("pointerEvents");
  });
});

describe("ScreenRouter Augury routing", () => {
  it("renders the Augury screen and logs the screen and encounter once under StrictMode", () => {
    const site = makeSite("Augury");
    const { container } = mountRouter({ state: makeStateFor(site), strict: true });

    expect(container.querySelector('[data-testid="cumulus-augury-site-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cumulus-augury-offer-A"]')).not.toBeNull();
    expect(logs("screen_rendered")).toHaveLength(1);
    expect(logs("screen_rendered")[0]).toMatchObject({ screenType: "site", siteId: site.id });

    const encounterLogs = logs("augury_encounter_generated");
    expect(encounterLogs).toHaveLength(1);
    const encounter = encounterLogs[0];
    const signature = encounter?.encounterSignature;
    expect(signature).toBeDefined();
    const offerLogs = logs("augury_offer_built");
    expect(offerLogs).toHaveLength(2);
    const deckHash = (encounter?.deck as { hash?: unknown } | undefined)?.hash;
    for (const offer of offerLogs) {
      expect(offer).toMatchObject({ encounterSignature: signature, deckHash });
    }
    expect(new Set(offerLogs.map((offer) => offer.offerId))).toEqual(new Set(["A", "B"]));
  });

  it("adds reroll and force-category debug commands to the journey menu", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    state.avatar = fixtureAvatar("72000000-0000-4000-8000-000000000001");
    const { container, mutations } = mountRouter({ state });
    const openMenu = () => click(container.querySelector('[data-testid="dreamscape-menu-button"]'));
    const menuRow = (action: string) =>
      container.querySelector(`[role="menuitem"][data-command-menu-action-id="${action}"]`);

    openMenu();
    click(menuRow("rerollJourney"));
    expect(mutations.rerollAugury).toHaveBeenCalledWith(site.id);

    const debug = logs("augury_encounter_generated")[0]?.debug as
      | { eligibleArchetypeIds?: AuguryArchetypeId[] }
      | undefined;
    const eligible = debug?.eligibleArchetypeIds?.[0];
    if (eligible === undefined) throw new Error("expected an eligible archetype");
    openMenu();
    click(menuRow("forceJourneyCategory"));
    expect(menuRow("forceJourneyCategory:clear")).not.toBeNull();
    click(menuRow(`forceJourneyCategory:${eligible}`));
    expect(mutations.forceAuguryArchetype).toHaveBeenCalledWith(site.id, eligible);
  });

  it("publishes card source debug for grant cards once, through StrictMode and the fold", async () => {
    // No dreamsigns and an empty deck leave only the face-up card grant
    // families eligible, so the encounter surfaces catalog grant cards.
    const state = { ...makeStateFor(makeSite("Augury")), deck: [] };
    const mounted = mountRouter({
      state,
      journeyContent: auguryContent({ withDreamsigns: false }),
      strict: true,
    });
    const publish = vi.mocked(mounted.mutations.setCardSourceDebug);
    expect(publish).toHaveBeenCalledTimes(1);
    const [published, source] = publish.mock.calls[0] ?? [];
    expect(source).toBe("augury_grant_cards_shown");
    expect(published?.surface).toBe("Reward");
    expect(published?.entries.some((entry) => typeof entry.cardNumber === "number")).toBe(true);

    const foldedMutations = makeMutations();
    await mounted.rerender({ ...state, cardSourceDebug: published ?? null }, foldedMutations);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(foldedMutations.setCardSourceDebug).not.toHaveBeenCalled();
  });

  it("walks away from a contained fallback when augury generation is unavailable", () => {
    const site = makeSite("Augury");
    const { container, mutations } = mountRouter({
      state: makeStateFor(site),
      journeyContent: auguryContent({ cards: [], withDreamsigns: false }),
    });
    click(container.querySelector('[data-testid="cumulus-augury-unavailable-exit"]'));
    expect(mutations.completeAugurySite).toHaveBeenCalledWith(site.id);
  });

  it("fails closed when persisted state targets an inline-only site", () => {
    const { container } = mountRouter({ state: makeStateFor(makeSite("Reward")) });
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();
  });
});
