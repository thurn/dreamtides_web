// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameCardModel } from "../../tango/components/card/CardView";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import type { BattleCardInstance } from "../types";
import { BattleGameCard, battleGameCardModel } from "./BattleGameCard";

const gameCard = vi.fn((props: { model: GameCardModel; unavailable?: boolean; hideRulesText?: boolean }) => (
  <div data-game-card="" data-card-id={props.model.cardId} data-spark={props.model.displaySnapshot.spark ?? ""} data-cost={props.model.displaySnapshot.energyCost ?? ""} data-unavailable={String(props.unavailable)} data-hide-rules={String(props.hideRulesText)} />
));
vi.mock("../../tango/components/card/CardView", () => ({ GameCard: (props: Parameters<typeof gameCard>[0]) => gameCard(props) }));

function instance(): BattleCardInstance {
  return {
    battleCardId: "battle-instance-7",
    definition: {
      sourceDeckEntryId: "deck-entry-2", cardId: "11111111-1111-4111-8111-111111111111",
      cardNumber: 2, name: "Archive Sentry", battleCardKind: "character", subtype: "Synth",
      energyCost: 1, printedEnergyCost: 3, printedSpark: 2, isFast: true, reclaimCost: 1,
      renderedText: "Discard a bane.", imageNumber: 2, transfiguration: "Kindled", isBane: false,
    },
    owner: "player", controller: "player", sparkDelta: 2, staticSparkBonus: 1,
    isRevealedToPlayer: true, status: { ...createDefaultBattleCardStatus(), counters: 2, isExhausted: true },
    markers: { isPrevented: false, isCopied: false }, notes: [],
    provenance: { kind: "quest-deck", sourceBattleCardId: null, chosenSpark: null, chosenSubtype: null,
      createdAtTurnNumber: null, createdAtSide: null, createdAtMs: null },
  };
}

beforeEach(() => { gameCard.mockClear(); (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

describe("BattleGameCard", () => {
  it("keeps battle instance identity separate from canonical reveal identity", () => {
    const card = instance(); const model = battleGameCardModel(card);
    expect(model.cardId).toBe(card.definition.cardId);
    expect(model.cardId).not.toBe(card.battleCardId);
    expect(model.displaySnapshot.id).toBe(card.definition.cardId);
    expect(model.displaySnapshot.spark).toBe(5);
    expect(model.displaySnapshot.energyCost).toBe(1);
    expect(model.displaySnapshot.renderedText).toContain("bane");
  });

  it("presents selection, playability, status, compact rules, and drag callbacks", () => {
    const dragStart = vi.fn(); const dragEnd = vi.fn(); const activate = vi.fn();
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    act(() => root.render(<BattleGameCard instance={instance()} selected playable={false} unaffordable compact draggable onActivate={activate} onDragStart={dragStart} onDragEnd={dragEnd} />));
    const source = container.querySelector<HTMLElement>('[data-battle-card-id="battle-instance-7"]');
    expect(source?.dataset.selected).toBe("true");
    expect(source?.dataset.battleCardCounters).toBe("2");
    expect(source?.dataset.battleCardExhausted).toBe("true");
    expect(source?.dataset.battleCardTransfiguration).toBe("Kindled");
    expect(container.querySelector('[data-game-card]')?.getAttribute("data-unavailable")).toBe("true");
    expect(container.querySelector('[data-game-card]')?.getAttribute("data-hide-rules")).toBe("true");
    act(() => { source?.dispatchEvent(new Event("dragstart", { bubbles: true })); });
    act(() => { source?.dispatchEvent(new Event("dragend", { bubbles: true })); });
    expect(dragStart).toHaveBeenCalledOnce(); expect(dragEnd).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });

  it("keeps hidden enemy identity out of the semantic GameCard path", () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    act(() => root.render(<BattleGameCard instance={instance()} hidden />));
    expect(container.querySelector('[data-battle-card-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[data-game-card]')).toBeNull();
    expect(gameCard).not.toHaveBeenCalled();
    act(() => root.unmount()); container.remove();
  });
});
