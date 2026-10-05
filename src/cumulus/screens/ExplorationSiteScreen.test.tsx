// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId, parseSiteId, type DeckEntryId } from "../../types/identifiers";
import {
  testCardId,
  testExplorationActionId,
  testGuideId,
} from "../../types/test-identities";
import { plainAnnotatedText } from "../../runtime/text";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { syntheticGameCard } from "../test-helpers/component-test-fixtures";
import { localizedDreamsignFixture } from "../test-helpers/dreamsign-fixture";
import {
  localizedTransfigurationFormFixture,
  transfigurationFormFixture,
} from "../test-helpers/transfiguration-fixture";
import { renderInCumulus } from "../testing/render";
import {
  ExplorationSiteScreen,
  type ExplorationActionView,
  type ExplorationFollowupView,
  type ExplorationSiteView,
} from "./ExplorationSiteScreen";

const reducedMotion = vi.hoisted(() => ({ value: true }));
const CHOICE_A = testExplorationActionId("choice-a");
const CHOICE_B = testExplorationActionId("choice-b");

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

function model(index = 17) {
  return syntheticGameCard(index, "Exploration Fixture");
}

function entry(entryId: DeckEntryId, index?: number) {
  return { entryId, model: model(index), isBane: false };
}

function view(resolved = false): ExplorationSiteView {
  const guideId = testGuideId("layaway");
  const action = (id: typeof CHOICE_A): ExplorationActionView => ({
    id,
    effectKind: "gain-card",
    mechanics: { effectKind: "gain-card" },
    label: "Fixture choice",
    effectText: plainAnnotatedText("Fixture effect."),
    followup: { kind: "none" },
    available: true,
  });
  return {
    siteId: parseSiteId("exploration-site"),
    scene: null,
    guide: { id: guideId, name: "Guide", line: "Greeting.", art: artRef.dreamGuide(guideId) },
    card: model(),
    fullArt: artRef.explorationCard(17),
    narrative: "A synthetic encounter waits in the dark.",
    actions: [action(CHOICE_A), action(CHOICE_B)],
    resolvedActionId: resolved ? CHOICE_A : null,
    reward: null,
    outcomeKind: null,
  };
}

/** A view whose first action opens `followup`, with optional overrides. */
function withFollowup(
  followup: ExplorationFollowupView,
  overrides: Partial<ExplorationActionView> = {},
): ExplorationSiteView {
  const base = view();
  return { ...base, actions: [{ ...base.actions[0], ...overrides, followup }, base.actions[1]] };
}

const copy = { title: "Fixture title", subtitle: "Fixture subtitle" };

function cardsFollowup(
  entryIds: readonly DeckEntryId[],
  options: Partial<Extract<ExplorationFollowupView, { selectionKey: "entryIds" }>>,
): ExplorationFollowupView {
  const cards = entryIds.map((entryId) => entry(entryId));
  const selection = { mode: "exact", selectionKey: "entryIds", min: 1, max: 1 } as const;
  return { kind: "cards", ...copy, cards, ...selection, ...options };
}

function dreamsign(idSeed: string) {
  const fixture = { name: idSeed, effectDescription: "Effect.", imageAlt: "Fixture art" };
  return localizedDreamsignFixture({ idSeed, ...fixture, imageName: `${idSeed}.webp` });
}

type Dreamsign = ReturnType<typeof dreamsign>;

function dreamsignFlow(
  mode: "gain-offered" | "purge-and-gain-random",
  offered: Dreamsign[],
  held: Dreamsign[],
  requiredOverflowReplacementCount: number,
): ExplorationSiteView {
  const flow = { mode, offered, held, requiredOverflowReplacementCount };
  return withFollowup({ kind: "dreamsign-flow", ...copy, ...flow });
}

function renderScreen(screenView: ExplorationSiteView) {
  const onChannel = vi.fn();
  const onResolve = vi.fn();
  const onExit = vi.fn();
  const rendered = renderInCumulus(
    <ExplorationSiteScreen view={screenView} {...{ onChannel, onResolve, onExit }} />,
  );
  const q = (selector: string) => rendered.container.querySelector<HTMLElement>(selector);
  const data = (selector: string) => q(selector)?.dataset;
  const byTestId = (marker: string) => q(`[data-testid="${marker}"]`);
  const click = (...markers: string[]) => {
    for (const marker of markers) act(() => byTestId(marker)?.click());
  };
  const finish = (selector: string) =>
    act(() => {
      q(selector)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
  const choice = () =>
    q('[data-testid="cumulus-exploration-choice-0"] [data-exploration-action-id]');
  const open = () => {
    click("cumulus-exploration-channel");
    act(() => choice()?.click());
  };
  return {
    ...{ ...rendered, onChannel, onResolve, onExit },
    ...{ q, data, byTestId, click, finish, choice, open },
  };
}

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

function immediateFrames(): void {
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
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

  it("gates a bounded card selection on its minimum, caps it at its maximum, and submits UUIDs", () => {
    const ids = ["entry-a", "entry-b", "entry-c"].map((id) => parseDeckEntryId(id));
    const s = renderScreen(
      withFollowup(cardsFollowup(ids, { selectionOperation: "purge", min: 1, max: 2 })),
    );
    s.open();
    expect(s.data('[data-exploration-followup="cards"]')?.explorationActionId).toBe(CHOICE_A);
    const confirm = s.byTestId("cumulus-exploration-followup-confirm");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    s.click("cumulus-exploration-card-entry-a");
    expect(confirm?.getAttribute("aria-disabled")).toBeNull();
    s.click("cumulus-exploration-card-entry-b", "cumulus-exploration-card-entry-c");
    expect(s.container.querySelectorAll('[data-card-choice-operation="purge"]')).toHaveLength(2);
    act(() => confirm?.click());
    expect(s.onResolve).toHaveBeenCalledOnce();
    expect(s.onResolve).toHaveBeenCalledWith(CHOICE_A, {
      entryIds: ids.slice(0, 2),
    });
  });

  it("lets the player undo the purge target in a purge-and-copy follow-up", () => {
    const [entryA, entryB] = ["entry-a", "entry-b"].map((id) => parseDeckEntryId(id));
    const s = renderScreen(
      withFollowup(cardsFollowup([entryA, entryB], { mode: "purge-and-copy", min: 2, max: 2 })),
    );
    s.open();
    const confirm = s.byTestId("cumulus-exploration-followup-confirm");
    const operation = (entryId: DeckEntryId, op: string) =>
      s.q(`[data-gallery-entry-id="${entryId}"] [data-card-choice-operation="${op}"]`);
    s.click("cumulus-exploration-card-entry-a");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    expect(operation(entryA, "purge")).not.toBeNull();
    s.click("cumulus-exploration-card-entry-b");
    expect(operation(entryB, "copy")).not.toBeNull();
    expect(confirm?.getAttribute("aria-disabled")).not.toBe("true");

    s.click("cumulus-exploration-card-entry-a");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    expect(s.q("[data-card-choice-operation]")).toBeNull();
  });

  it("collects per-card forms across back navigation and dispatches once", () => {
    const candidate = (entryId: DeckEntryId, index?: number) => {
      const m = model(index);
      return {
        entryId,
        model: m,
        availability: "available" as const,
        reforgedType: null,
        forms: (["Empowered", "Kindled"] as const).map((type) => ({
          type,
          presentation: localizedTransfigurationFormFixture(type),
          effectDetails: { entryId, type },
          pricing: { kind: "unpriced" as const },
          previewModel: {
            ...m,
            transfiguration: {
              ...{ type, form: transfigurationFormFixture(type), markedText: "" },
              ...{ energyChanged: false, energyChangeName: null, fastChanged: false },
              ...{ sparkChanged: false, sparkChangeName: null },
            },
          },
        })),
      };
    };
    const [multiA, multiB] = ["multi-a", "multi-b"].map((id) => parseDeckEntryId(id));
    const candidates = [candidate(multiA), candidate(multiB, 28)];
    const s = renderScreen(
      withFollowup({ kind: "multi-card-transfiguration", ...copy, count: 2, candidates }),
    );
    s.open();
    s.click(
      "cumulus-exploration-multi-transfiguration-card-multi-a",
      "cumulus-exploration-multi-transfiguration-card-multi-b",
      "cumulus-exploration-multi-transfiguration-cards-confirm",
    );
    const step = () => s.data('[data-exploration-multi-transfiguration-step="form"]');
    expect(step()?.explorationMultiTransfigurationCurrentEntryId).toBe("multi-a");
    s.click(
      "cumulus-transfiguration-form-Empowered",
      "cumulus-transfiguration-confirm",
      "cumulus-transfiguration-form-Kindled",
      "cumulus-transfiguration-choose-again",
    );
    expect(step()?.explorationMultiTransfigurationCurrentEntryId).toBe("multi-a");
    expect(step()?.explorationMultiTransfigurationCurrentForm).toBe("Empowered");
    s.click("cumulus-transfiguration-confirm");
    expect(step()?.explorationMultiTransfigurationCurrentForm).toBe("Kindled");
    expect(s.onResolve).not.toHaveBeenCalled();
    s.click("cumulus-transfiguration-confirm");
    expect(s.onResolve).toHaveBeenCalledOnce();
    expect(s.onResolve).toHaveBeenCalledWith(CHOICE_A, {
      entryIds: [multiA, multiB],
      transfigurations: ["Empowered", "Kindled"],
    });
  });

  it("resolves a pack only from its explicit Choose control", () => {
    const s = renderScreen(
      withFollowup({
        kind: "packs",
        ...copy,
        packs: [0, 1].map((index) => ({
          index,
          cards: [0, 1].map((card) => ({
            ...entry(parseDeckEntryId("unused")),
            entryId: testCardId(`pack-${String(index)}-${String(card)}`),
          })),
        })),
      }),
    );
    s.open();
    s.click("cumulus-exploration-pack-1");
    expect(s.onResolve).not.toHaveBeenCalled();
    s.click("cumulus-exploration-pack-1-choose");
    expect(s.onResolve).toHaveBeenCalledWith(CHOICE_A, { packIndex: 1 });
  });

  it("chooses an offered Dreamsign, then a capacity replacement only at cap", () => {
    const offered = dreamsign("offered-one");
    const held = dreamsign("held-one");
    const offeredId = `cumulus-exploration-dreamsign-offered-${offered.id}`;

    const atCap = renderScreen(dreamsignFlow("gain-offered", [offered], [held], 1));
    atCap.open();
    expect(document.activeElement?.getAttribute("data-testid")).toBe(offeredId);
    atCap.click(offeredId);
    expect(atCap.onResolve).not.toHaveBeenCalled();
    const flowStep = atCap.data("[data-exploration-dreamsign-flow]")?.explorationDreamsignFlowStep;
    expect(flowStep).toBe("replacement");
    atCap.click(
      `cumulus-exploration-dreamsign-replacement-${held.id}`,
      "cumulus-exploration-followup-confirm",
    );
    expect(atCap.onResolve).toHaveBeenCalledOnce();
    expect(atCap.onResolve).toHaveBeenCalledWith(CHOICE_A, {
      offeredDreamsignId: offered.id,
      replacedDreamsignId: held.id,
    });

    const belowCap = renderScreen(dreamsignFlow("gain-offered", [offered], [held], 0));
    belowCap.open();
    belowCap.click(offeredId);
    expect(belowCap.onResolve).toHaveBeenCalledWith(CHOICE_A, {
      offeredDreamsignId: offered.id,
    });
  });

  it("purges first, then requires the exact overflow targets", () => {
    const held = ["held-1", "held-2", "held-3", "held-4"].map(dreamsign);
    const s = renderScreen(dreamsignFlow("purge-and-gain-random", [], held, 2));
    s.open();
    s.click(`cumulus-exploration-dreamsign-purge-${held[0].id}`);
    expect(s.data("[data-exploration-dreamsign-flow]")?.explorationDreamsignFlowStep).toBe(
      "overflow",
    );
    s.click(
      ...held.slice(1).map((item) => `cumulus-exploration-dreamsign-replacement-${item.id}`),
      "cumulus-exploration-followup-confirm",
    );
    expect(s.onResolve).toHaveBeenCalledWith(CHOICE_A, {
      purgedDreamsignId: held[0].id,
      overflowReplacementDreamsignIds: [held[1].id, held[2].id],
    });
  });

  it("closes the site-type chooser on Escape and submits a keyboard-selected site type", () => {
    const siteTypes = ["Shop", "Purge", "Transfiguration"] as const;
    const choices = siteTypes.map((siteType, index) => ({
      siteType,
      model: {
        ...{ id: parseSiteId(`prepared-site-${String(index)}`), type: siteType, index },
        ...{ isVisited: false, isBattle: false, isLocked: false, isInteractive: true },
        ...{ pos: { x: 50, y: 50 }, label: siteType, blurb: "", lockedGuidance: "" },
        icon: GLYPHS.copy,
      },
    }));
    const s = renderScreen(withFollowup({ kind: "site-types", ...copy, choices }));
    s.open();
    const key = (target: EventTarget | null | undefined, keyName: string) =>
      act(() => {
        target?.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true }));
      });
    key(window, "Escape");
    expect(s.q('[data-exploration-followup="site-types"]')).toBeNull();

    act(() => s.choice()?.click());
    key(
      s.q('[data-exploration-site-type-choice="Purge"] [data-site-node-presentation="choice"]'),
      "Enter",
    );
    expect(s.onResolve).toHaveBeenCalledOnce();
    expect(s.onResolve).toHaveBeenCalledWith(CHOICE_A, { siteType: "Purge" });
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
