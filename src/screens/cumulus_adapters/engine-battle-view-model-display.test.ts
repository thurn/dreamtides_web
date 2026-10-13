// What the battle screen model shows the human: hidden cards only as
// positions, status badges on the cards the viewer sees, and the result.
import { describe, expect, it, vi } from "vitest";
import { createEngine, type InstanceId } from "../../engine";
import { DSL } from "../../engine/testing/dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { ZONE } from "../../engine/testing/zone-cards";
import { act, engine as reclaimEngine, fromVoid, KEEP, placed, playOn, reclaim } from "../../engine/effects/primitives/contracts/reclaim-not-banished-support";
import { parseBattleCardId } from "../../types/identifiers";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import { CHOSEN_HAND_BANISH_CARDS, HAND_BANISH } from "../../engine/testing/chosen-hand-banish-cards";
import { boardState } from "../../engine/testing/board";
import { SIDES } from "../../engine/state/ids";
import type { EngineCardDefinition } from "../../engine/catalog";
import { banish, moveToHand } from "../../engine/rules/zones";
import {
  enginePrintedKeywords,
  engineStatuses,
} from "./engine-battle-view-model";
import { board, cards, deck, engine, screenOf } from "./engine-battle-view-model.fixtures";

describe("buildEngineBattleScreenModel", () => {
  it("maps a public hand-return duration to its physical card and owner's status, with a log entry", () => {
    const local = createEngine(testCatalog(CHOSEN_HAND_BANISH_CARDS));
    const { state, ids } = boardState(local.catalog, { active: "player", phase: "day",
      player: { hand: [HAND_BANISH.freeCard.id] }, enemy: { hand: [SYNTHETIC.event0.id, SYNTHETIC.event0.id] } });
    const result = local.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, { answer: () => [ids.enemy.hand[1]] });
    for (const viewer of SIDES) {
      const statuses = engineStatuses(local.view(result.state, viewer), viewer, enginePrintedKeywords(local.catalog));
      expect(statuses.cards.get(ids.enemy.hand[1])?.map((badge) => badge.kind)).toEqual(["returns"]);
      expect(statuses.cards.has(ids.enemy.hand[0])).toBe(false);
      expect(statuses.sides.enemy.map((badge) => badge.kind)).toEqual(["returns"]);
      expect(statuses.sides.player).toEqual([]);
      const event = result.events.find((event) => event.kind === "effectStarted")!;
      const identified: (InstanceId | null)[] = [];
      const line = engineBattleLogText(event, { human: viewer, card: (id) => { identified.push(id); return null; }, dreamwell: () => null });
      expect(line).toBeTypeOf("string");
      expect(identified).toContain(ids.enemy.hand[1]);
    }
  });
  it.each([false, true])("does not promise an old return after a public hand move or rebanishment (%s)", (rebanish) => {
    const mover: EngineCardDefinition = { ...HAND_BANISH.bounce, id: syntheticId(0x473b0), abilities: () => [],
      synthetic: { resolve(ctx) {
        const id = ctx.state.sides.enemy.banished[0];
        if (id === undefined) throw new Error("missing banished card");
        if (moveToHand(ctx, id, "enemy") === "hand") ctx.emit({ kind: "returnedToHand", instance: id, side: "enemy" });
        if (rebanish) banish(ctx, id);
      } } };
    const local = createEngine(testCatalog([...CHOSEN_HAND_BANISH_CARDS, mover]));
    const { state, ids } = boardState(local.catalog, { active: "player", phase: "day",
      player: { hand: [HAND_BANISH.freeCard.id, mover.id] }, enemy: { hand: [SYNTHETIC.event0.id, SYNTHETIC.event0.id] } });
    const chosen = local.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, { answer: () => [ids.enemy.hand[1]] });
    const moved = local.apply(chosen.state, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, { answer: () => { throw new Error("unexpected prompt"); } });
    expect(moved.state.instances[ids.enemy.hand[1]].zone).toBe(rebanish ? "banished" : "hand");
    for (const viewer of SIDES) {
      const statuses = engineStatuses(local.view(moved.state, viewer), viewer, enginePrintedKeywords(local.catalog));
      expect(statuses.cards.has(ids.enemy.hand[1])).toBe(false);
      expect(statuses.sides.enemy).toEqual([]);
    }
  });
  it("suppresses covered Reclaim badges in play and on the stack, and shows uncovered and banished cards by instance", () => {
    const { state, ids } = placed({ back: [KEEP.keeper.id], void: [KEEP.revenant.id], hand: [KEEP.dissolveOne.id, KEEP.dissolveOne.id], energy: 3 });
    const keeper = ids.player.back[0]!;
    const revenant = ids.player.void[0];
    const covered = reclaim(state, revenant);
    const uncovered = playOn(covered, ids.player.hand[0], keeper).state;
    const banished = playOn(uncovered, ids.player.hand[1], revenant).state;
    const pending = placed({ back: [KEEP.keeper.id], void: [KEEP.spell.id], energy: 3 }, { hand: [KEEP.dissolveInterrupt.id], energy: 1 });
    const spell = pending.ids.player.void[0];
    const stacked = act(pending.state, "player", fromVoid(spell)).state;
    expect(stacked.stack).toContainEqual(expect.objectContaining({ kind: "card", instance: spell }));
    const printed = enginePrintedKeywords(reclaimEngine.catalog);
    for (const viewer of ["player", "enemy"] as const) {
      const badges = (current: typeof state, id: InstanceId) => engineStatuses(reclaimEngine.view(current, viewer), viewer, printed).cards.get(id)?.map((badge) => badge.kind) ?? [];
      expect(badges(covered, revenant)).toEqual([]);
      expect(badges(stacked, spell)).toEqual([]);
      expect(badges(uncovered, revenant)).toEqual(["duration"]);
      expect(badges(banished, revenant)).toEqual(["duration"]);
      expect(banished.instances[revenant]).toMatchObject({ zone: "banished", status: { reclaimed: true } });
    }
  });

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
      [...model.view.nearHand.cards, ...model.view.near.frontRank.map((slot) => slot.card), ...model.view.near.backRank.map((slot) => slot.card)]
        .find((card) => card?.id === parseBattleCardId(id))
        ?.statuses?.map((badge) => badge.kind) ?? [];

    expect(kinds(granted)).toEqual(["keyword"]);
    expect(kinds(printed)).toEqual([]);
    expect(kinds(floating)).toEqual(["keyword"]);
    expect(kinds(nomad)).toEqual([]);
    expect(kinds(offered)).toEqual(["duration"]);
    expect([...model.view.nearHand.cards, ...model.view.near.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card]))]
      .flatMap((card) => card.statuses ?? [])
      .every((badge) => badge.label.length > 0)).toBe(true);
    expect(model.view.farHand.cards).toEqual([]);

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
    expect(model.view.near.status.statuses?.filter((badge) => badge.kind === "delayedTrigger").map((badge) => badge.source))
      .toEqual([parseBattleCardId(first), parseBattleCardId(second)]);
    expect(model.view.far.status.statuses?.filter((badge) => badge.kind === "delayedTrigger").map((badge) => badge.source)).toEqual([parseBattleCardId(enemy)]);
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

  it("marks a card whose own cost changed for the side that sees it, and logs the change", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla2.id], back: [SYNTHETIC.vanilla1.id] }, enemy: { hand: [SYNTHETIC.vanilla2.id] } });
    const [held] = ids.player.hand;
    const [hidden] = ids.enemy.hand;
    const [source] = ids.player.back;
    if (held === undefined || hidden === undefined || source == null) throw new Error("missing cards");
    const change = (instance: InstanceId, id: `e${number}`) => ({
      id, controller: "player" as const, source, timestamp: 0, expiry: { at: "endOfTurn" } as const,
      change: { kind: "cardCost", instance, mode: "set", amount: 0 } as const,
    });
    state.floating.push(change(held, "e901"), change(hidden, "e902"));
    const printed = enginePrintedKeywords(engine.catalog);
    const kinds = (viewer: "player" | "enemy", id: InstanceId) => engineStatuses(engine.view(state, viewer), viewer, printed).cards.get(id)?.map((badge) => badge.kind);
    expect(kinds("player", held)).toEqual(["duration"]);
    expect(kinds("enemy", hidden)).toEqual(["duration"]);
    // Neither side sees a badge on the other's hidden card, nor the change.
    expect(kinds("enemy", held)).toBeUndefined();
    expect(kinds("player", hidden)).toBeUndefined();
    expect(engine.view(state, "player").instances[held]?.characteristics.cost).toBe(0);
    const { id: _id, timestamp: _timestamp, ...started } = change(held, "e901");
    const event = { kind: "effectStarted", effect: "e901", ...started } as const;
    expect(engineBattleLogText(event, { human: "player", card: () => null, dreamwell: () => null })).not.toBeNull();
  });
});
