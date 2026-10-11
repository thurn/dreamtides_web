// What the battle screen model shows the human: hidden cards only as
// positions, status badges on the cards the viewer sees, and the result.
import { describe, expect, it, vi } from "vitest";
import { type InstanceId } from "../../engine";
import { DSL } from "../../engine/testing/dsl-cards";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { ZONE } from "../../engine/testing/zone-cards";
import { parseBattleCardId } from "../../types/identifiers";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import {
  enginePrintedKeywords,
  engineStatuses,
} from "./engine-battle-view-model";
import { board, cards, deck, engine, screenOf } from "./engine-battle-view-model.fixtures";

describe("buildEngineBattleScreenModel", () => {
  it("shows hidden cards only as positions", () => {
    const { state, ids } = board({ enemy: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] } });
    const model = screenOf(state);
    const hidden = new Set<string>([...ids.enemy.hand, ...ids.enemy.deck, ...ids.player.deck]);

    expect(model.view.farHand.cardIds).toHaveLength(2);
    expect(model.view.far.deckCardIds).toHaveLength(deck.length);
    const shown = [...model.view.farHand.cardIds, ...model.view.far.deckCardIds, ...model.view.near.deckCardIds];
    expect(shown.filter((cardId) => hidden.has(cardId))).toEqual([]);
    expect(model.view.farHand.cards).toEqual([]);
  });

  it("marks keywords beyond the printed and floating ones and the Offering status, on cards the viewer sees", () => {
    const { state, ids } = board({
      player: {
        front: [DSL.handOffering.id],
        back: [SYNTHETIC.vanilla1.id],
        hand: [SYNTHETIC.vanilla1.id, ZONE.offeringBrute.id, SYNTHETIC.vanilla2.id],
      },
      enemy: { front: [DSL.handOffering.id], hand: [SYNTHETIC.vanilla1.id] },
    });
    const [granted, printed, floating] = ids.player.hand;
    const [nomad] = ids.player.front;
    const [offered] = ids.player.back;
    if (granted === undefined || printed === undefined || floating === undefined || nomad == null || offered == null) {
      throw new Error("missing cards");
    }
    const offeredCard = state.instances[offered];
    if (offeredCard === undefined) throw new Error("missing card");
    offeredCard.status.offering = true;
    state.floating.push({
      id: "e900",
      controller: "player",
      source: nomad,
      timestamp: 0,
      expiry: { at: "endOfTurn" },
      change: { kind: "keyword", instance: floating, keyword: "offering", gains: true },
    });
    const model = screenOf(state);
    const kinds = (id: InstanceId) =>
      [...model.view.playerHand, ...model.view.player.frontRank.map((slot) => slot.card), ...model.view.player.backRank.map((slot) => slot.card)]
        .find((card) => card?.id === parseBattleCardId(id))
        ?.statuses?.map((badge) => badge.kind) ?? [];

    expect(kinds(granted)).toEqual(["keyword"]);
    expect(kinds(printed)).toEqual([]);
    expect(kinds(floating)).toEqual(["keyword"]);
    expect(kinds(nomad)).toEqual([]);
    expect(kinds(offered)).toEqual(["duration"]);
    expect([...model.view.playerHand, ...model.view.player.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card]))]
      .flatMap((card) => card.statuses ?? [])
      .every((badge) => badge.label.length > 0)).toBe(true);
    expect(model.view.enemyHand).toEqual([]);

    const printedKeywords = enginePrintedKeywords(engine.catalog);
    const seenByPlayer = engineStatuses(engine.view(state, "player"), "player", printedKeywords).cards;
    const seenByEnemy = engineStatuses(engine.view(state, "enemy"), "enemy", printedKeywords).cards;
    expect(ids.enemy.hand.filter((id) => seenByPlayer.has(id))).toEqual([]);
    expect(ids.player.hand.filter((id) => seenByEnemy.has(id))).toEqual([]);
    expect(ids.enemy.hand.map((id) => seenByEnemy.get(id)?.map((badge) => badge.kind))).toEqual([["keyword"]]);
    expect(seenByEnemy.get(offered)?.map((badge) => badge.kind)).toEqual(["duration"]);
  });

  it("reports the battle's result from the human's side", () => {
    const { state } = board({});
    state.sides.player.score = 4;
    // Two committed states: the engine never sees a state change after it is handed one.
    const won = screenOf({ ...state, result: { kind: "victory", winner: "player", reason: "score" } });
    const lost = screenOf({ ...state, result: { kind: "victory", winner: "enemy", reason: "score" } });

    expect(won.view.result).toMatchObject({ outcome: "victory", playerScore: 4, essenceReward: 100 });
    expect(lost.view.result).toEqual({ outcome: "defeat", dismissed: false });
    expect(won.affordances.canAct).toBe(false);
  });

  it("keeps separate physical trigger sources and their owning sides, naming only visible identities", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla1.id] }, enemy: { front: [SYNTHETIC.vanilla1.id], hand: [SYNTHETIC.vanilla1.id] } });
    const [first, second] = ids.player.hand;
    const [hidden] = ids.enemy.hand;
    const [enemy] = ids.enemy.front;
    if (first === undefined || second === undefined || hidden === undefined || enemy == null) throw new Error("missing sources");
    const trigger = (source: InstanceId, controller: "player" | "enemy", id: `e${number}`) => ({
      id, controller, source, timestamp: 0, expiry: { at: "endOfTurn" } as const,
      change: { kind: "trigger", ref: { origin: { kind: "card", cardId: SYNTHETIC.vanilla1.id, variant: state.instances[source].variant }, ability: 0, node: 0 }, once: false } as const,
    });
    state.floating.push(trigger(first, "player", "e901"), trigger(second, "player", "e902"), trigger(enemy, "enemy", "e903"), trigger(hidden, "enemy", "e904"));
    const model = screenOf(state);
    expect(model.view.player.status.statuses?.filter((badge) => badge.kind === "delayedTrigger").map((badge) => badge.source))
      .toEqual([parseBattleCardId(first), parseBattleCardId(second)]);
    expect(model.view.enemy.status.statuses?.filter((badge) => badge.kind === "delayedTrigger").map((badge) => badge.source)).toEqual([parseBattleCardId(enemy)]);
    const view = engine.view(state, "player");
    const missing = { ...view, instances: { ...view.instances }, floating: view.floating.map((effect) => effect.controller === "enemy" ? { ...effect, source: null } : effect) };
    delete missing.instances[first];
    expect(engineStatuses(missing, "player", enginePrintedKeywords(engine.catalog), new Set(), cards).sides.player.map((badge) => badge.source))
      .toEqual([undefined, parseBattleCardId(second)]);
    expect(engineStatuses(missing, "player", enginePrintedKeywords(engine.catalog), new Set(), cards).sides.enemy.map((badge) => badge.source)).toEqual([undefined]);
    expect(view.floating.map((effect) => effect.expiry)).toEqual(state.floating.slice(0, 3).map((effect) => effect.expiry));
  });

  it("resolves trigger log source through the viewer's card resolver without recovering hidden origins", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id] } });
    const [source] = ids.player.hand;
    if (source === undefined) throw new Error("missing source");
    const event = { kind: "effectStarted", effect: "e901", controller: "player", source, expiry: { at: "endOfTurn" },
      change: { kind: "trigger", ref: { origin: { kind: "card", cardId: SYNTHETIC.vanilla1.id, variant: state.instances[source].variant }, ability: 0, node: 0 }, once: false } } as const;
    const card = vi.fn(() => null);
    expect(engineBattleLogText(event, { human: "player", card, dreamwell: () => null })).not.toBeNull();
    expect(card).toHaveBeenCalledExactlyOnceWith(source);
    card.mockClear();
    expect(engineBattleLogText({ ...event, source: { kind: "avatar", side: "player" } }, { human: "player", card, dreamwell: () => null })).not.toBeNull();
    expect(card).not.toHaveBeenCalled();
  });
});
