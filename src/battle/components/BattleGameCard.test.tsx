// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TangoRoot } from "../../tango/TangoRoot";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import type { BattleCardInstance } from "../types";
import { BattleGameCard, battleGameCardModel } from "./BattleGameCard";

const UUID = "11111111-1111-4111-8111-111111111111";
let resizeCallbacks: ResizeObserverCallback[] = [];

function instance(overrides: Partial<BattleCardInstance> = {}): BattleCardInstance {
  return {
    battleCardId: "battle-instance-7",
    definition: {
      sourceDeckEntryId: "deck-entry-2", cardId: UUID, cardNumber: 2,
      name: "Archive Sentry", battleCardKind: "character", subtype: "Synth",
      energyCost: 1, printedEnergyCost: 3, printedSpark: 2, isFast: true,
      reclaimCost: 1, renderedText: "Discard a bane.", imageNumber: 2,
      transfiguration: "Kindled", isBane: false,
    },
    owner: "player", controller: "player", figments: [2, 3, 4], sparkDelta: 2,
    staticSparkBonus: 1, isRevealedToPlayer: true,
    status: { ...createDefaultBattleCardStatus(), counters: 2, isExhausted: true },
    markers: { isPrevented: false, isCopied: false }, notes: [],
    provenance: { kind: "quest-deck", sourceBattleCardId: null, chosenSpark: null,
      chosenSubtype: null, createdAtTurnNumber: null, createdAtSide: null, createdAtMs: null },
    ...overrides,
  };
}

function mount(node: React.ReactNode) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); act(() => root.render(<TangoRoot>{node}</TangoRoot>));
  return { container, root };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({ matches: query.includes("pointer: fine"), media: query,
    onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
    if (this.hasAttribute("data-game-card-source")) return { x: 80, y: 120, left: 80, top: 120, right: 240, bottom: 344, width: 160, height: 224, toJSON: () => ({}) } as DOMRect;
    if (this.dataset.revealMeasure === "primary") return { x: 0, y: 0, left: 0, top: 0, right: 340, bottom: 476, width: 340, height: 476, toJSON: () => ({}) } as DOMRect;
    return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks(); document.body.innerHTML = "";
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
});

describe("BattleGameCard", () => {
  it("adapts effective battle state and transfiguration into the canonical model", () => {
    const card = instance(); const model = battleGameCardModel(card);
    expect(model.cardId).toBe(card.definition.cardId);
    expect(model.cardId).not.toBe(card.battleCardId);
    expect(model.displaySnapshot.spark).toBe(5);
    expect(model.displaySnapshot.energyCost).toBe(1);
    expect(model.transfiguration).toMatchObject({ type: "Kindled", color: "#fca5a5", sparkChanged: true });
  });

  it("visibly renders counters, figment count, and the transfiguration marker/tint", () => {
    const baseInstance = instance();
    const figmentInstance = instance({
      provenance: { ...baseInstance.provenance, kind: "generated-figment" },
    });
    const { container, root } = mount(<BattleGameCard instance={figmentInstance} />);
    expect(container.querySelector(".c-counters")?.textContent).toContain("2");
    expect(container.querySelector(".c-figment-count")?.textContent).toBe("3");
    const marker = container.querySelector<HTMLElement>('[aria-label="Kindled transfiguration"]');
    expect(marker).not.toBeNull();
    expect(marker?.style.color).toBe("rgb(252, 165, 165)");
    expect(container.querySelector<HTMLElement>('[data-card-stat="spark"] div')?.style.color).not.toBe("rgb(255, 255, 255)");
    act(() => root.unmount()); container.remove();
  });

  it("hides a noncanonical enemy card before any visual or semantic fallback", () => {
    const synthetic = instance({ definition: { ...instance().definition, cardId: "", name: "Secret Token", renderedText: "Secret rules.", imageNumber: 99 } });
    const { container, root } = mount(<BattleGameCard instance={synthetic} variant="hand" hidden />);
    expect(container.querySelector('[data-battle-card-hidden="true"]')).not.toBeNull();
    expect(container.querySelector("[data-game-card-source]")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("Secret Token");
    expect(container.textContent).not.toContain("Secret rules");
    expect(container.textContent).not.toContain("12");
    act(() => root.unmount()); container.remove();
  });

  it("dismisses a real reading reveal and suppresses activation for a recognized drag", async () => {
    const activate = vi.fn(); const dragStart = vi.fn(); const dragEnd = vi.fn();
    const { container, root } = mount(<BattleGameCard instance={instance()} draggable onActivate={activate} onDragStart={dragStart} onDragEnd={dragEnd} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]")!;
    const wrapper = container.querySelector<HTMLElement>("[data-battle-card-id]")!;
    act(() => { source.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    await vi.waitFor(() => expect(document.querySelector("[data-tango-reveal-group]")).not.toBeNull());

    act(() => { source.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", pointerId: 1, button: 0 })); });
    act(() => { wrapper.dispatchEvent(new Event("dragstart", { bubbles: true })); });
    expect(document.querySelector("[data-tango-reveal-group]")).toBeNull();
    act(() => {
      source.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", pointerId: 1 }));
      wrapper.dispatchEvent(new Event("dragend", { bubbles: true }));
      source.click();
    });
    expect(activate).not.toHaveBeenCalled();
    expect(dragStart).toHaveBeenCalledOnce(); expect(dragEnd).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });
});
