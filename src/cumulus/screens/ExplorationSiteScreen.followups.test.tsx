// @vitest-environment jsdom

// ExplorationSiteScreen: card, transfiguration, pack, Dreamsign, and
// site-type follow-ups.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId, parseSiteId, type DeckEntryId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { GLYPHS } from "../primitives/glyph";
import {
  transfigurationPresentationFixture,
  transfigurationFormFixture,
} from "../test-helpers/transfiguration-fixture";
import type {
  ExplorationFollowupView,
  ExplorationSiteView,
} from "./ExplorationSiteScreen";
import {
  CHOICE_A,
  copy,
  dreamsign,
  entry,
  immediateFrames,
  model,
  renderScreen,
  withFollowup,
  type Dreamsign,
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

function cardsFollowup(
  entryIds: readonly DeckEntryId[],
  options: Partial<Extract<ExplorationFollowupView, { selectionKey: "entryIds" }>>,
): ExplorationFollowupView {
  const cards = entryIds.map((entryId) => entry(entryId));
  const selection = { mode: "exact", selectionKey: "entryIds", min: 1, max: 1 } as const;
  return { kind: "cards", ...copy, cards, ...selection, ...options };
}

function dreamsignFlow(
  mode: "gain-offered" | "purge-and-gain-random",
  offered: Dreamsign[],
  held: Dreamsign[],
  requiredOverflowReplacementCount: number,
): ExplorationSiteView {
  const flow = { mode, offered, held, requiredOverflowReplacementCount };
  return withFollowup({ kind: "dreamsign-flow", ...copy, ...flow });
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
          presentation: transfigurationPresentationFixture(type),
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
});
