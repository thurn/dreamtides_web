import { GLYPHS } from "../primitives/glyph";
import { testDreamsignId } from "../../types/test-identities";
// @vitest-environment jsdom

// ExplorationSiteScreen: the card's travel, the frame break, direct
// resolution, and the exits after resolution. Follow-ups have their own
// ExplorationSiteScreen.followups.test.tsx.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId } from "../../types/identifiers";
import {
  CHOICE_A,
  dreamsign,
  entry,
  immediateFrames,
  renderScreen,
  view,
  withFollowup,
} from "./ExplorationSiteScreen.fixtures";

const reducedMotion = vi.hoisted(() => ({ value: true }));

// Motion elements render as plain divs; `contextmenu` stands in for
// `onAnimationComplete` so a test can finish one animation deterministically.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const M = React.forwardRef<HTMLElement, Record<string, unknown>>(function M(props, ref) {
    const { initial, animate, exit, transition, layout, onAnimationComplete, ...rest } = props;
    void [initial, animate, exit, transition, layout];
    return React.createElement("div", { ...rest, ref, onContextMenu: onAnimationComplete });
  });
  return {
    motion: { div: M, img: M, main: M, section: M, span: M },
    useReducedMotion: () => reducedMotion.value,
  };
});

function placeDeckTarget(): void {
  const deckTarget = document.createElement("button");
  deckTarget.dataset.journeyDeckTarget = "";
  deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
  document.body.append(deckTarget);
}

/** Advances fake timers one second per act so effects can schedule follow-ups. */
function advance(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 1_000) {
    act(() => {
      vi.advanceTimersByTime(Math.min(1_000, ms - elapsed));
    });
  }
}

beforeEach(() => {
  reducedMotion.value = true;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  immediateFrames();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 100, 240, 336),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ExplorationSiteScreen", () => {
  it("renders the selected card and opens the frame break on channel", () => {
    const s = renderScreen(view());
    expect(s.data("[data-exploration-card-slot]")?.cardId).toBe(view().card.cardId);
    expect(s.q("[data-site-layout-guide]")).not.toBeNull();

    s.click("cumulus-exploration-channel");
    expect(s.onChannel).toHaveBeenCalledOnce();
    expect(s.data("[data-exploration-frame-break]")?.explorationFrameBreakPhase).toBe("open");
    expect(s.byTestId("cumulus-exploration-channel")).toBeNull();
    act(() => s.q("[data-exploration-full-art]")?.click());
    expect(s.onExit).not.toHaveBeenCalled();
  });

  it("resolves a direct choice by UUID and submits a preselected target without a picker", () => {
    const direct = renderScreen(view());
    direct.open();
    expect(direct.onResolve).toHaveBeenCalledWith(CHOICE_A);

    const entryIds = [parseDeckEntryId("minted-entry")];
    const automatic = renderScreen(
      withFollowup({ kind: "none" }, { automaticSelection: { entryIds } }),
    );
    automatic.open();
    expect(automatic.q("[data-exploration-followup]")).toBeNull();
    expect(automatic.onResolve).toHaveBeenCalledWith(CHOICE_A, { entryIds });
  });

  it("travels the card in from the deck and disables choices while the narrative types", () => {
    vi.useFakeTimers();
    immediateFrames();
    reducedMotion.value = false;
    placeDeckTarget();
    const s = renderScreen(view());
    expect(s.data("[data-exploration-card-travel]")?.explorationSource).toBe("journey-deck");
    s.finish("[data-exploration-card-travel]");
    s.click("cumulus-exploration-channel");
    s.finish("[data-exploration-frame-break]");

    expect(s.choice()?.getAttribute("aria-disabled")).toBe("true");
    act(() => s.choice()?.click());
    expect(s.onResolve).not.toHaveBeenCalled();

    advance(20_000);
    expect(s.q("[data-exploration-choices-state='revealed']")).not.toBeNull();
    expect(s.choice()?.hasAttribute("aria-disabled")).toBe(false);
    act(() => s.choice()?.click());
    expect(s.onResolve).toHaveBeenCalledWith(CHOICE_A);
  });

  it("returns the card to the journey deck before exiting a reward-free resolution", () => {
    reducedMotion.value = false;
    placeDeckTarget();
    const s = renderScreen(view(true));
    const phase = s.data("[data-exploration-frame-break]")?.explorationFrameBreakPhase;
    expect(phase).toBe("collapsing");
    s.finish("[data-exploration-frame-break]");
    expect(s.data("[data-exploration-card-return]")?.explorationDestination).toBe("journey-deck");
    expect(s.onExit).not.toHaveBeenCalled();
    s.finish("[data-exploration-card-return]");
    expect(s.onExit).toHaveBeenCalledOnce();
  });

  it("flies a gained Dreamsign to its UUID-matched HUD dock", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotion.value = false;
    const gained = dreamsign("reward-dreamsign");
    const dock = document.createElement("span");
    dock.dataset.dreamsignId = gained.id;
    dock.getBoundingClientRect = () => new DOMRect(1140, 730, 58, 58);
    document.body.append(dock);
    const s = renderScreen({
      ...view(true),
      reward: {
        objects: { cards: [], purgedCards: [], dreamsigns: [gained] },
        deckModification: null,
      },
    });
    s.finish("[data-exploration-card-travel]");
    s.click("cumulus-exploration-channel");
    s.finish("[data-exploration-frame-break]");
    expect(dock.style.visibility).toBe("hidden");
    advance(10_000);
    const flight = '[data-exploration-reward-flight="dreamsign"]';
    expect(s.data(flight)?.explorationDestination).toBe("journey-dreamsign");
    s.finish(flight);
    expect(s.onExit).toHaveBeenCalledOnce();
    s.unmount();
    expect(dock.style.visibility).toBe("");
  });

  it("holds an overflowing replacement review until the player scrolls through it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pairsSize = (size: number) =>
      function (this: HTMLElement) {
        return this.hasAttribute("data-exploration-card-replacement-pairs") ? size : 0;
      };
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(pairsSize(500));
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(pairsSize(720));
    const s = renderScreen({
      ...view(true),
      outcomeKind: "card-replacements",
      reward: {
        kind: "card-replacements",
        sourceKind: "replace-selected",
        replacements: ["a", "b", "c", "d"].map((suffix, index) => ({
          purged: entry(parseDeckEntryId(`purged-${suffix}`)),
          gained: entry(parseDeckEntryId(`gained-${suffix}`), 40 + index),
        })),
      },
    });
    const reviewed = () =>
      s.data('[data-exploration-outcome="card-replacements"]')?.explorationCardReplacementReviewed;
    const pairs = s.q("[data-exploration-card-replacement-pairs]")!;
    expect(pairs.getAttribute("role")).toBe("region");
    expect(reviewed()).toBe("false");
    advance(60_000);
    expect(s.onExit).not.toHaveBeenCalled();

    Object.defineProperty(pairs, "scrollTop", { configurable: true, value: 220 });
    act(() => {
      pairs.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(reviewed()).toBe("true");
    act(() => {
      vi.runAllTimers();
    });
    expect(s.onExit).toHaveBeenCalledOnce();
  });
});


it("offers the optional reroll through one controlled button and disables consumed uses", () => {
  vi.useFakeTimers();
  const model = view();
  const rendered = renderScreen({ ...model, reroll: {
    dreamsignId: testDreamsignId("reroll-source"), label: "Synthetic action", glyph: GLYPHS.refresh,
    expectedEncounterCardId: model.card.cardId, expectedRerollCount: 0, available: true,
  } });
  rendered.open();
  rendered.click("cumulus-exploration-reroll");
  expect(rendered.onReroll).toHaveBeenCalledTimes(1);
  rendered.unmount();
  const disabled = renderScreen({ ...model, reroll: {
    dreamsignId: testDreamsignId("reroll-source"), label: "Synthetic action", glyph: GLYPHS.refresh,
    expectedEncounterCardId: model.card.cardId, expectedRerollCount: 1, available: false,
  } });
  disabled.open();
  disabled.click("cumulus-exploration-reroll");
  expect(disabled.onReroll).not.toHaveBeenCalled();
});
