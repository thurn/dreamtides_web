// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/dreamscape/SiteNode";
import { artRef } from "../primitives/art";
import { glyph } from "../primitives/glyph";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { renderInCumulus } from "../testing/render";
import type { SiteState } from "../../types/journey";
import {
  parseSiteId,
  type DreamsignId,
  type SiteId,
} from "../../types/identifiers";
import {
  testDreamscapeArtKey,
  testDreamsignId,
} from "../../types/test-identities";
import { DreamscapeScreen, type DreamscapeView } from "./DreamscapeScreen";

beforeEach(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DreamscapeScreen", () => {
  function siteModel(
    idSeed: string,
    overrides: Partial<SiteState> = {},
  ): DreamscapeSiteModel {
    const site: SiteState = {
      id: parseSiteId(idSeed),
      type: "Purge",
      isEnhanced: false,
      isVisited: false,
      ...overrides,
    };
    return {
      id: site.id,
      type: site.type,
      isVisited: site.isVisited,
      pos: { x: 40, y: 40 },
      index: 0,
      isBattle: site.type === "Battle",
      isLocked: false,
      isInteractive: !site.isVisited,
      label: site.type,
      blurb: "Fixture blurb.",
      icon: glyph("bxf bx-hot"),
    };
  }

  const VIEW: DreamscapeView = {
    scene: artRef.dreamscapeScene(testDreamscapeArtKey("ember_wood")),
    title: "Ember Wood",
    inlineRewards: {},
    replacement: null,
    sites: [
      siteModel("s-purge"),
      siteModel("s-draft", { type: "Draft" }),
      siteModel("s-visited", { type: "Shop", isVisited: true }),
    ],
  };

  interface Handlers {
    readonly onSelectSite?: (id: SiteId) => void;
    readonly onInlineRewardAnimationComplete?: (id: SiteId) => void;
    readonly onReplaceDreamsign?: (id: DreamsignId) => void;
    readonly onDeclineReward?: () => void;
  }

  function screen(view: DreamscapeView, handlers: Handlers = {}) {
    return (
      <DreamscapeScreen
        view={view}
        onSelectSite={handlers.onSelectSite ?? (() => undefined)}
        onInlineRewardAnimationComplete={
          handlers.onInlineRewardAnimationComplete ?? (() => undefined)
        }
        onReplaceDreamsign={handlers.onReplaceDreamsign ?? (() => undefined)}
        onDeclineReward={handlers.onDeclineReward ?? (() => undefined)}
      />
    );
  }

  function dreamsign(idSeed: string) {
    return dreamsignViewFixture({
      id: testDreamsignId(idSeed),
      name: "Fixture Dreamsign",
      effectDescription: "Fixture effect.",
      imageName: `${idSeed}.webp`,
    });
  }

  it("renders one node per unvisited site and leaves journey chrome to the router", () => {
    const { container } = renderInCumulus(screen(VIEW));
    expect(container.querySelector("[data-cumulus-dreamscape]")).not.toBeNull();
    expect(container.querySelectorAll("[data-site-id]")).toHaveLength(2);
    expect(container.querySelector('[data-site-id="s-visited"]')).toBeNull();
    expect(container.querySelector('[data-site-id="s-draft"]')).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();
  });

  it("collects an Essence reward in place and completes it through the latest callback", () => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const staleComplete = vi.fn();
    const view: DreamscapeView = {
      ...VIEW,
      sites: [siteModel("s-essence", { type: "Essence" })],
      inlineRewards: { "s-essence": { kind: "essence", amount: 275 } },
    };
    const { container, rerender } = renderInCumulus(
      screen(view, {
        onSelectSite,
        onInlineRewardAnimationComplete: staleComplete,
      }),
    );

    act(() =>
      container
        .querySelector<HTMLElement>('[data-site-id="s-essence"]')
        ?.click(),
    );
    expect(onSelectSite).toHaveBeenCalledWith("s-essence");
    expect(
      container
        .querySelector('[data-essence-collection="s-essence"]')
        ?.getAttribute("aria-label"),
    ).not.toContain("s-essence");
    expect(
      container.querySelector('[data-essence-site-departure="s-essence"]'),
    ).not.toBeNull();

    const latestComplete = vi.fn();
    rerender(
      screen(
        {
          ...view,
          sites: [siteModel("s-essence", { type: "Essence", isVisited: true })],
        },
        { onSelectSite, onInlineRewardAnimationComplete: latestComplete },
      ),
    );
    expect(
      container.querySelector('[data-site-id="s-essence"]'),
    ).not.toBeNull();

    act(() => {
      vi.runAllTimers();
    });
    expect(staleComplete).not.toHaveBeenCalled();
    expect(latestComplete).toHaveBeenCalledTimes(1);
    expect(latestComplete).toHaveBeenCalledWith("s-essence");
    expect(container.querySelector('[data-site-id="s-essence"]')).toBeNull();
  });

  it("presents a Dreamsign Reward by UUID at its node", () => {
    const reward = dreamsign("dreamsign-uuid");
    const view: DreamscapeView = {
      ...VIEW,
      sites: [siteModel("s-reward", { type: "Reward" })],
      inlineRewards: {
        "s-reward": {
          kind: "dreamsign",
          requiresReplacement: false,
          dreamsign: reward,
        },
      },
    };
    const onSelectSite = vi.fn();
    const { container } = renderInCumulus(screen(view, { onSelectSite }));

    act(() =>
      container
        .querySelector<HTMLElement>('[data-site-id="s-reward"]')
        ?.click(),
    );
    expect(onSelectSite).toHaveBeenCalledWith("s-reward");
    const collection = container.querySelector(
      '[data-reward-collection="s-reward"]',
    );
    expect(collection?.getAttribute("aria-label")).not.toContain(
      "dreamsign-uuid",
    );
    expect(
      collection?.querySelector(`[data-dreamsign-id="${reward.id}"]`),
    ).not.toBeNull();
  });

  it("keeps site selection available after refused inline preparation", () => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const onComplete = vi.fn();
    const view: DreamscapeView = {
      ...VIEW,
      sites: [siteModel("s-essence", { type: "Essence" }), siteModel("s-purge")],
    };
    const { container } = renderInCumulus(
      screen(view, { onSelectSite, onInlineRewardAnimationComplete: onComplete }),
    );
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click());
    expect(onSelectSite).toHaveBeenCalledWith(parseSiteId("s-essence"));
    expect(container.querySelector("[data-essence-collection]")).toBeNull();
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-purge"]')?.click());
    expect(onSelectSite).toHaveBeenCalledWith(parseSiteId("s-purge"));
    act(() => { vi.runAllTimers(); });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("waits for authoritative preparation and permits retry before collecting once", () => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const onComplete = vi.fn();
    const view: DreamscapeView = {
      ...VIEW,
      sites: [siteModel("s-essence", { type: "Essence" }), siteModel("s-purge")],
    };
    const { container, rerender } = renderInCumulus(
      screen(view, { onSelectSite, onInlineRewardAnimationComplete: onComplete }),
    );
    const select = () => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click();
    act(select);
    act(() => { vi.runAllTimers(); });
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.querySelector('[data-site-id="s-purge"]')?.getAttribute("aria-disabled")).toBe("false");
    act(select);
    expect(onSelectSite).toHaveBeenCalledTimes(2);
    rerender(screen({ ...view, inlineRewards: { "s-essence": { kind: "essence", amount: 17 } } },
      { onSelectSite, onInlineRewardAnimationComplete: onComplete }));
    expect(container.querySelector('[data-essence-collection="s-essence"]')).not.toBeNull();
    act(select);
    expect(onSelectSite).toHaveBeenCalledTimes(2);
    act(() => { vi.runAllTimers(); });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(parseSiteId("s-essence"));
  });

  it.each(["s-purge", "s-reward"])("supersedes pending collection when selecting %s", (nextSite) => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const view: DreamscapeView = {
      ...VIEW,
      sites: [siteModel("s-essence", { type: "Essence" }), siteModel("s-purge"), siteModel("s-reward", { type: "Reward" })],
    };
    const { container, rerender } = renderInCumulus(screen(view, { onInlineRewardAnimationComplete: onComplete }));
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click());
    act(() => container.querySelector<HTMLElement>(`[data-site-id="${nextSite}"]`)?.click());
    rerender(screen({ ...view, inlineRewards: { "s-essence": { kind: "essence", amount: 17 } } },
      { onInlineRewardAnimationComplete: onComplete }));
    act(() => { vi.runAllTimers(); });
    expect(container.querySelector("[data-essence-collection]")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each(["visited", "removed"])("cancels a pending request when its site is %s", (change) => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const view: DreamscapeView = { ...VIEW, sites: [siteModel("s-essence", { type: "Essence" })] };
    const { container, rerender } = renderInCumulus(screen(view, { onInlineRewardAnimationComplete: onComplete }));
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click());
    rerender(screen({ ...view, sites: change === "removed" ? [] : [siteModel("s-essence", { type: "Essence", isVisited: true })],
      inlineRewards: { "s-essence": { kind: "essence", amount: 17 } } },
      { onInlineRewardAnimationComplete: onComplete }));
    act(() => { vi.runAllTimers(); });
    expect(container.querySelector("[data-essence-collection]")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each(["reward", "site", "unmount"])("cancels active collection when its %s disappears", (change) => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const onSelectSite = vi.fn();
    const view: DreamscapeView = { ...VIEW,
      sites: [siteModel("s-essence", { type: "Essence" }), siteModel("s-purge")],
      inlineRewards: { "s-essence": { kind: "essence", amount: 17 } },
    };
    const { container, rerender, unmount } = renderInCumulus(screen(view, { onSelectSite, onInlineRewardAnimationComplete: onComplete }));
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click());
    if (change === "unmount") unmount();
    else {
      rerender(screen({ ...view, ...(change === "reward" ? { inlineRewards: {} } : { sites: [siteModel("s-purge")] }) },
        { onSelectSite, onInlineRewardAnimationComplete: onComplete }));
      act(() => container.querySelector<HTMLElement>('[data-site-id="s-purge"]')?.click());
      expect(onSelectSite).toHaveBeenCalledWith(parseSiteId("s-purge"));
    }
    act(() => { vi.runAllTimers(); });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each([false, true])("completes a prepared Dreamsign once with replacement=%s", (requiresReplacement) => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const onComplete = vi.fn();
    const view: DreamscapeView = { ...VIEW,
      sites: [siteModel("s-essence", { type: "Essence" })],
      inlineRewards: { "s-essence": { kind: "dreamsign", dreamsign: dreamsign("incoming"), requiresReplacement } },
    };
    const { container, rerender } = renderInCumulus(screen(view, { onSelectSite, onInlineRewardAnimationComplete: onComplete }));
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click());
    act(() => container.querySelector<HTMLElement>('[data-site-id="s-essence"]')?.click());
    rerender(screen(view, { onSelectSite, onInlineRewardAnimationComplete: onComplete }));
    expect(onSelectSite).toHaveBeenCalledTimes(1);
    act(() => { vi.runAllTimers(); });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(parseSiteId("s-essence"));
  });

  it("resolves an at-cap Dreamsign replacement by UUID or declines it", () => {
    const onReplaceDreamsign = vi.fn();
    const onDeclineReward = vi.fn();
    const incoming = dreamsign("pending-dreamsign");
    const held = dreamsign("held-dreamsign");
    const view: DreamscapeView = {
      ...VIEW,
      sites: [siteModel("s-reward", { type: "Reward" })],
      inlineRewards: {
        "s-reward": {
          kind: "dreamsign",
          dreamsign: incoming,
          requiresReplacement: true,
        },
      },
      replacement: { incoming, held: [held], capacity: 1 },
    };
    renderInCumulus(screen(view, { onReplaceDreamsign, onDeclineReward }));

    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          `[data-replace-dreamsign-id="${held.id}"] button`,
        )
        ?.click(),
    );
    expect(onReplaceDreamsign).toHaveBeenCalledWith(held.id);
    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          "[data-dreamsign-replacement-dialog] > div:last-child button",
        )
        ?.click(),
    );
    expect(onDeclineReward).toHaveBeenCalledTimes(1);
  });
});

describe("SiteNode", () => {
  it("keeps a locked site focusable and descriptive while suppressing activation", () => {
    const model: DreamscapeSiteModel = {
      id: parseSiteId("00000000-0000-4000-8000-000000000041"),
      type: "Battle",
      isVisited: false,
      pos: { x: 50, y: 50 },
      index: 0,
      isBattle: true,
      isLocked: true,
      isInteractive: false,
      label: "Guardian Battle",
      lockedGuidance: "Visit the other sites first.",
      blurb: "Defeat the guardian.",
      icon: glyph("bxf bx-shield"),
    };
    const onSelect = vi.fn();
    const { container } = renderInCumulus(
      <SiteNode model={model} motion={false} onSelect={onSelect} />,
    );
    const source = container.querySelector<HTMLElement>("[data-site-id]")!;

    expect(source.tabIndex).toBe(0);
    expect(source.dataset.revealEntityType).toBe("site");
    expect(source.dataset.revealEntityId).toBe(model.id);
    expect(source.dataset.revealPrimaryVariant).toBe("icon");
    expect(source.getAttribute("aria-disabled")).toBe("true");
    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain(model.lockedGuidance);
    act(() => source.click());
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("renders persisted reward choices, dispatches a nonfirst UUID and retains explicit replacement controls", () => {
    vi.useFakeTimers();
    const first = dreamsignViewFixture({ idSeed: "enhanced-first", name: "Same name" });
    const second = dreamsignViewFixture({ idSeed: "enhanced-second", name: "Same name" });
    const held = dreamsignViewFixture({ idSeed: "enhanced-held", name: "Same name" });
    const view: DreamscapeView = { scene: null, title: "Synthetic", sites: [], inlineRewards: {}, replacement: null, rewardChoice: { siteId: parseSiteId("enhanced-reward"),
      options: [first, second], replacement: null } };
    const onChoice = vi.fn(), onDecline = vi.fn(), onCancel = vi.fn(), onAnimation = vi.fn();
    const props = { onSelectSite: vi.fn(), onReplaceDreamsign: vi.fn(), onDeclineReward: vi.fn(),
      onInlineRewardAnimationComplete: onAnimation, onRewardChoice: onChoice,
      onDeclineRewardChoice: onDecline, onCancelRewardReplacement: onCancel };
    const { container, rerender } = renderInCumulus(<DreamscapeScreen view={view} {...props} />);
    expect(container.querySelectorAll("[data-reward-option-id]")).toHaveLength(2);
    act(() => container.querySelector<HTMLButtonElement>(`[data-reward-option-id="${second.id}"] button`)?.click());
    expect(onChoice).toHaveBeenCalledWith(second.id);
    act(() => { vi.runAllTimers(); }); expect(onAnimation).not.toHaveBeenCalled();
    rerender(<DreamscapeScreen view={{ ...view, rewardChoice: { ...view.rewardChoice!,
      replacement: { incoming: second, held: [held], capacity: 1 } } }} {...props} />);
    expect(container.querySelector("[data-incoming-dreamsign-id]")?.getAttribute("data-incoming-dreamsign-id")).toBe(second.id);
    act(() => container.querySelector<HTMLButtonElement>(`[data-replace-dreamsign-id="${held.id}"] button`)?.click());
    expect(onChoice).toHaveBeenCalledWith(second.id, held.id);
    const dialogButtons = container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button');
    act(() => dialogButtons[dialogButtons.length - 1]?.click());
    expect(onCancel).toHaveBeenCalled();
    rerender(<DreamscapeScreen view={view} {...props} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button');
    act(() => buttons[buttons.length - 1]?.click());
    expect(onDecline).toHaveBeenCalled();
  });

});
