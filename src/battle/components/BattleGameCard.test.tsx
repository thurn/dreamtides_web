// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import { TRANSFIGURE_MARK_END, TRANSFIGURE_MARK_START } from "../../runtime/transfigure-markers";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import type { BattleCardInstance, BattleDeckCardDefinition } from "../types";
import { BattleGameCard, battleGameCardModel } from "./BattleGameCard";
import "../battle.css";

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
      transfiguration: "Kindled",
      transfigurationDisplay: {
        type: "Kindled", color: "#fca5a5", markedText: "Discard a bane.",
        energyChanged: false, sparkChanged: true, fastChanged: false,
      },
      isBane: false,
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
  const root = createRoot(container); act(() => root.render(<CumulusRoot>{node}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({ matches: query.includes("pointer: fine"), media: query,
    onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  resizeCallbacks = [];
  resetLog();
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

  it("uses the exact persisted text-changing and applicability-sensitive displays", () => {
    const inspired: CardTransfigurationDisplay = {
      type: "Inspired", color: "#93c5fd",
      markedText: `Foresee. ${TRANSFIGURE_MARK_START}Draw a card.${TRANSFIGURE_MARK_END}\n\nReclaim 2●`,
      energyChanged: false, sparkChanged: false, fastChanged: false,
    };
    const perfected: CardTransfigurationDisplay = {
      type: "Perfected", color: "#d8b4fe", markedText: "A wall of thorns.",
      energyChanged: false, sparkChanged: true, fastChanged: true,
    };
    const withDisplay = (
      display: CardTransfigurationDisplay,
      renderedText: string,
    ): BattleCardInstance => instance({
      definition: {
        ...instance().definition,
        renderedText,
        transfiguration: display.type,
        transfigurationDisplay: display,
      } as BattleDeckCardDefinition & { transfigurationDisplay: CardTransfigurationDisplay },
    });

    expect(battleGameCardModel(withDisplay(inspired, "Foresee. Draw a card.\n\nReclaim 2●")).transfiguration)
      .toEqual(inspired);
    expect(battleGameCardModel(withDisplay(perfected, "A wall of thorns.")).transfiguration)
      .toEqual(perfected);

    const { container, root } = mount(
      <BattleGameCard instance={withDisplay(inspired, "Foresee. Draw a card.\n\nReclaim 2●")} />,
    );
    const highlighted = [...container.querySelectorAll<HTMLElement>("span")]
      .find((span) => span.textContent === "Draw a card.");
    expect(highlighted?.style.color).toBe("rgb(147, 197, 253)");
    expect(container.textContent).toContain("Reclaim 2●");
    act(() => root.unmount()); container.remove();
  });

  it("applies the battle exhausted treatment to the canonical GameCard surface", () => {
    const { container, root } = mount(<BattleGameCard instance={instance()} exhausted />);
    const surface = container.querySelector<HTMLElement>(".battle-game-card-surface");
    expect(surface).not.toBeNull();
    expect(getComputedStyle(surface!).filter).toBe("grayscale(0.5) brightness(0.62)");
    act(() => root.unmount()); container.remove();
  });

  it("visibly renders counters, figment count, and the transfiguration markers", () => {
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
    expect(container.querySelector<HTMLElement>('[data-card-stat="spark"] div')?.style.color).toBe("rgb(255, 255, 255)");
    const badge = container.querySelector<HTMLElement>('[data-card-stat-change="kindled"]');
    expect(badge).not.toBeNull();
    expect(badge?.querySelector(".fa-hammer")).not.toBeNull();
    act(() => root.unmount()); container.remove();
  });

  it("gives a generated figment a stable UUID semantic reveal without using its name as identity", async () => {
    const generated = instance({
      battleCardId: "generated-figment-17",
      definition: { ...instance().definition, cardId: "", name: "Duplicate Display Name" },
      provenance: { ...instance().provenance, kind: "generated-figment" },
    });
    const model = battleGameCardModel(generated);
    expect(model.cardId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(model.cardId).not.toContain(generated.definition.name);
    expect(battleGameCardModel({ ...generated, definition: { ...generated.definition, name: "Renamed" } }).cardId).toBe(model.cardId);

    const { container, root } = mount(<BattleGameCard instance={generated} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]")!;
    expect(source).not.toBeNull();
    expect(container.querySelector("[data-battle-card-semantic-kind=generated]")).not.toBeNull();
    expect(container.querySelector('[data-testid="figment-title-bar"]')).not.toBeNull();
    act(() => { source.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await Promise.resolve(); });
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    await vi.waitFor(() => expect(getLogEntries().some((entry) => entry.event === "cumulus_entity_reveal_opened" && entry.sourceEntityId === model.cardId)).toBe(true));
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
    await vi.waitFor(() => expect(document.querySelector("[data-cumulus-reveal-group]")).not.toBeNull());

    act(() => { source.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", pointerId: 1, button: 0 })); });
    act(() => { wrapper.dispatchEvent(new Event("dragstart", { bubbles: true })); });
    expect(document.querySelector("[data-cumulus-reveal-group]")).toBeNull();
    act(() => {
      source.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", pointerId: 1 }));
      wrapper.dispatchEvent(new Event("dragend", { bubbles: true }));
      source.click();
    });
    expect(activate).not.toHaveBeenCalled();
    expect(dragStart).toHaveBeenCalledOnce(); expect(dragEnd).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });

  it("allows keyboard activation after a drag without a compatibility click", () => {
    const activate = vi.fn();
    const { container, root } = mount(
      <BattleGameCard instance={instance()} draggable onActivate={activate} />,
    );
    const source = container.querySelector<HTMLElement>("[data-game-card-source]")!;
    const wrapper = container.querySelector<HTMLElement>("[data-battle-card-id]")!;
    act(() => {
      wrapper.dispatchEvent(new Event("dragstart", { bubbles: true }));
      wrapper.dispatchEvent(new Event("dragend", { bubbles: true }));
      source.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      source.click();
    });
    expect(activate).not.toHaveBeenCalled();
    act(() => {
      source.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(activate).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });
});
