import { describe, expect, it } from "vitest";
import { costModifier, adjustedEnergy } from "../../../continuous/costs";
import { cardMatchesFilter } from "../../../continuous/characteristics";
import { eventSeenBy, type EngineEvent } from "../../../events";
import type { CardId, InstanceId } from "../../../state/ids";
import type { BattleState, FloatingEffect } from "../../../state/types";
import { placeFigment } from "../../../testing/board";
import { CONTINUOUS } from "../../../testing/continuous-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { ZONE_FIGMENT } from "../../../testing/zone-cards";
import { modifyCardCost } from "../modify-card-cost";
import { returnToHand } from "../return-to-hand";
import { self } from "../../../dsl/builders";
import { v } from "./cards-support";
import { act, canPlay, costNow, engine, filler, MC, Picking, placed, play, playAndResolve, resolveStack } from "./modify-card-cost-support";

const started = (events: readonly EngineEvent[]) => events.filter((event) => event.kind === "effectStarted");
const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;

describe("modifyCardCost", () => {
  it("makes the card its effect returned cost more, for whoever plays it, permanently and wherever it goes", () => {
    const { state, ids } = placed({ hand: [MC.repel.id, MC.repel.id], energy: 2 }, { back: [v.vanilla2.id], energy: 3 });
    const returned = ids.enemy.back[0];
    const repelled = playAndResolve(state, "player", ids.player.hand[0]);
    expect(zoneOf(repelled.state, returned)).toBe("hand");
    expect(repelled.state.floating).toEqual([
      expect.objectContaining({ expiry: { at: "never" }, change: { kind: "cardCost", instance: returned, mode: "increase", amount: 2 } }),
    ]);
    // The return was public, so both sides see the card, its changed cost, and the effect.
    for (const viewer of ["player", "enemy"] as const) {
      expect(costNow(repelled.state, returned, viewer)).toBe(4);
      expect(engine.view(repelled.state, viewer).floating).toHaveLength(1);
      expect(started(repelled.events).every((event) => eventSeenBy(event, viewer, repelled.state) !== null)).toBe(true);
    }
    // Its cost for conditions is still the copiable 2●.
    expect(cardMatchesFilter(repelled.state, engine.catalog, returned!, { costAtMost: 2 })).toBe(true);
    // With 3● the opponent cannot play it on its turn; with 4● it can, and pays 4●.
    const enemyDay = passUntil(engine, repelled.state, at(engine, "enemy", "day")).state;
    const short: BattleState = { ...enemyDay, sides: { ...enemyDay.sides, enemy: { ...enemyDay.sides.enemy, currentEnergy: 3 } } };
    expect(canPlay(short, "enemy", returned)).toBe(false);
    const rich: BattleState = { ...enemyDay, sides: { ...enemyDay.sides, enemy: { ...enemyDay.sides.enemy, currentEnergy: 4 } } };
    expect(canPlay(rich, "enemy", returned)).toBe(true);
    const replayed = playAndResolve(rich, "enemy", returned).state;
    expect(replayed.sides.enemy.currentEnergy).toBe(0);
    expect(zoneOf(replayed, returned)).toBe("play");
    // The change travels with the card: returned again, it costs 2● more again, and a second change adds to it.
    const back = passUntil(engine, replayed, at(engine, "player", "day")).state;
    const again = resolveStack(act({ ...back, sides: { ...back.sides, player: { ...back.sides.player, currentEnergy: 1 } } }, "player", play(ids.player.hand[1])).state).state;
    expect(zoneOf(again, returned)).toBe("hand");
    expect(costNow(again, returned, "enemy")).toBe(6);
  });

  it("sets a drawn card's cost to 0● permanently, private to the drawing side", () => {
    const { state, ids } = placed({ hand: [MC.weave.id], deck: [v.vanilla3.id, v.vanilla2.id, ...filler] });
    const [skipped, drawn] = ids.player.deck;
    const { state: after, events } = playAndResolve(state, "player", ids.player.hand[0]);
    expect(zoneOf(after, drawn)).toBe("hand");
    expect(zoneOf(after, skipped)).toBe("deck");
    expect(costNow(after, drawn, "player")).toBe(0);
    expect(canPlay(after, "player", drawn)).toBe(true);
    expect(engine.view(after, "player").floating).toHaveLength(1);
    // The opponent sees neither the card, its cost, nor the effect naming it.
    expect(engine.view(after, "enemy").instances[drawn]).toBeUndefined();
    expect(engine.view(after, "enemy").floating).toEqual([]);
    const effect = started(events);
    expect(effect).toHaveLength(1);
    expect(eventSeenBy(effect[0], "player", after)).not.toBeNull();
    expect(eventSeenBy(effect[0], "enemy", after)).toBeNull();
    // Played for 0● and returned to the void, the permanent change still applies there.
    const played = playAndResolve(after, "player", drawn).state;
    expect(played.sides.player.currentEnergy).toBe(0);
    expect(played.floating).toHaveLength(1);
  });

  it("changes nothing when its effect moves no card into a hand", () => {
    // No matching card, and an empty deck's Fatigue.
    for (const deck of [[v.vanilla3.id, v.vanilla5.id], []]) {
      const { state, ids } = placed({ hand: [MC.weave.id], deck });
      const { state: after, events } = playAndResolve(state, "player", ids.player.hand[0]);
      expect(after.floating).toEqual([]);
      expect(started(events)).toEqual([]);
      expect(after.sides.player.fatigueCount).toBe(deck.length === 0 ? 1 : 0);
    }
    // A figment returned to hand ceases to exist instead.
    const figment = placed({ hand: [MC.repel.id], energy: 1 });
    const token = placeFigment(figment.state, "enemy", { rank: "back", index: 0 }, { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 });
    const { state: gone, events } = playAndResolve(figment.state, "player", figment.ids.player.hand[0]);
    expect(gone.instances[token]).toBeUndefined();
    expect(gone.floating).toEqual([]);
    expect(started(events)).toEqual([]);
  });

  it("changes no card when its target left play in response, even one that reached a hand another way", () => {
    const { state, ids } = placed({ hand: [MC.repel.id], energy: 1 }, { hand: [MC.quickRecall.id], back: [v.vanilla2.id] });
    const chosen = ids.enemy.back[0];
    const opened = act(state, "player", play(ids.player.hand[0])).state;
    expect(opened.stack).toHaveLength(1);
    expect(engine.decision(opened)?.side).toBe("enemy");
    const responded = act(opened, "enemy", play(ids.enemy.hand[0]));
    const rest = resolveStack(responded.state);
    const after = rest.state;
    const events = [...responded.events, ...rest.events];
    expect(events).toContainEqual(expect.objectContaining({ kind: "noLegalTarget" }));
    expect(zoneOf(after, chosen)).toBe("hand");
    expect(after.floating).toEqual([]);
    expect(started(events)).toEqual([]);
    expect(costNow(after, chosen, "enemy")).toBe(2);
  });
});

describe("modifyCardCost with other cost changes", () => {
  const withChanges = (state: BattleState, card: InstanceId, changes: readonly FloatingEffect["change"][]): BattleState => ({
    ...state,
    floating: [
      ...state.floating,
      ...changes.map((change, index): FloatingEffect => ({ id: `e${900 + index}`, controller: "player", source: card, timestamp: index, expiry: { at: "endOfTurn" }, change })),
    ],
  });
  const cost = (state: BattleState, card: InstanceId) =>
    adjustedEnergy(3, costModifier(state, engine.catalog, card, "player"));

  it("starts from the latest set cost, then adds increases, then subtracts reductions, never below 0", () => {
    const { state, ids } = placed({ hand: [v.vanilla3.id], back: [CONTINUOUS.characterDiscount.id] });
    const [card] = ids.player.hand;
    const base = { ...state, floating: [] };
    // The player's own static "characters cost 1● less" applies after every set and increase.
    expect(cost(base, card)).toBe(2);
    expect(cost(withChanges(base, card, [{ kind: "cardCost", instance: card, mode: "set", amount: 0 }]), card)).toBe(0);
    expect(cost(withChanges(base, card, [{ kind: "cardCost", instance: card, mode: "set", amount: 0 }, { kind: "cardCost", instance: card, mode: "increase", amount: 2 }]), card)).toBe(1);
    expect(cost(withChanges(base, card, [{ kind: "cardCost", instance: card, mode: "increase", amount: 2 }, { kind: "cardCost", instance: card, mode: "set", amount: 1 }]), card)).toBe(2);
    expect(cost(withChanges(base, card, [{ kind: "cardCost", instance: card, mode: "set", amount: 5 }, { kind: "cardCost", instance: card, mode: "set", amount: 2 }]), card)).toBe(1);
    expect(cost(withChanges(base, card, [{ kind: "cardCost", instance: card, mode: "set", amount: 5 }]), card)).toBe(4);
    // A change to another card does not apply.
    expect(cost(withChanges(base, card, [{ kind: "cardCost", instance: ids.player.back[0]!, mode: "set", amount: 0 }]), card)).toBe(2);
  });

  it("keeps X paid on top of a set cost", () => {
    const { state, ids } = placed({ hand: [MC.xSpell.id], energy: 2 });
    const [spell] = ids.player.hand;
    const changed = withChanges(state, spell, [{ kind: "cardCost", instance: spell, mode: "set", amount: 0 }]);
    expect(costNow(changed, spell, "player")).toBe(0);
    const source = new Picking();
    const played = act(changed, "player", play(spell), source).state;
    expect(source.prompts).toContainEqual(expect.objectContaining({ kind: "chooseNumber", max: 2 }));
    expect(played.sides.player.currentEnergy).toBe(0);
  });

  it("keeps mandatory, optional and alternative additional energy paid on top of a set cost", () => {
    /** `card` alone in the player's hand with `energy`●, its cost set to 0●. */
    const setToZero = (card: CardId, energy: number) => {
      const { state, ids } = placed({ hand: [card], energy });
      const [id] = ids.player.hand;
      return { state: withChanges(state, id, [{ kind: "cardCost", instance: id, mode: "set", amount: 0 }]), id };
    };
    const left = (state: BattleState, id: InstanceId, source?: Picking) => playAndResolve(state, "player", id, source).state.sides.player.currentEnergy;

    // "To play this card, pay 2●": the set cost replaces only the printed 3●.
    for (const energy of [0, 1]) {
      const { state, id } = setToZero(MC.tithe.id, energy);
      expect(canPlay(state, "player", id)).toBe(false);
    }
    const tithe = setToZero(MC.tithe.id, 3);
    expect(canPlay(tithe.state, "player", tithe.id)).toBe(true);
    expect(left(tithe.state, tithe.id)).toBe(1);

    // "You may pay 2●": playable for 0●, and paying it spends 2●.
    const unpaid = setToZero(MC.patron.id, 0);
    expect(canPlay(unpaid.state, "player", unpaid.id)).toBe(true);
    expect(left(unpaid.state, unpaid.id)).toBe(0);
    const patron = setToZero(MC.patron.id, 3);
    const paying = new Picking(undefined, { confirm: true });
    expect(left(patron.state, patron.id, paying)).toBe(1);
    expect(paying.prompts).toContainEqual(expect.objectContaining({ kind: "confirm" }));
    expect(left(patron.state, patron.id, new Picking(undefined, { confirm: false }))).toBe(3);

    // "Pay 1● or 3●": unplayable for 0●, and each alternative spends its energy.
    const broke = setToZero(MC.toll.id, 0);
    expect(canPlay(broke.state, "player", broke.id)).toBe(false);
    const short = setToZero(MC.toll.id, 1);
    expect(canPlay(short.state, "player", short.id)).toBe(true);
    expect(left(short.state, short.id)).toBe(0);
    const toll = setToZero(MC.toll.id, 4);
    const dear = new Picking(undefined, { mode: 1 });
    expect(left(toll.state, toll.id, dear)).toBe(1);
    expect(dear.prompts).toContainEqual(expect.objectContaining({ kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] }));
    expect(left(toll.state, toll.id, new Picking(undefined, { mode: 0 }))).toBe(3);
  });

  it("returns its own source and makes it cost 0● until the turn ends, wherever it is", () => {
    const { state, ids } = placed({ back: [MC.courser.id], hand: [MC.animal.id, MC.animal.id], energy: 2 });
    const courser = ids.player.back[0];
    const { state: after, events } = act(state, "player", play(ids.player.hand[0]));
    expect(zoneOf(after, courser)).toBe("hand");
    expect(started(events)).toEqual([expect.objectContaining({ expiry: { at: "endOfTurn" }, change: { kind: "cardCost", instance: courser, mode: "set", amount: 0 } })]);
    for (const viewer of ["player", "enemy"] as const) expect(costNow(after, courser, viewer)).toBe(0);
    const resolved = resolveStack(after).state;
    // Played for 0●, it returns once more on the next spirit animal and still costs 0● this turn.
    const replayed = playAndResolve(resolved, "player", courser).state;
    expect(replayed.sides.player.currentEnergy).toBe(1);
    const second = act(replayed, "player", play(ids.player.hand[1])).state;
    expect(zoneOf(second, courser)).toBe("hand");
    expect(costNow(second, courser, "player")).toBe(0);
    // Both changes end as the turn ends; the card costs its printed 3● again.
    const ended = passUntil(engine, resolveStack(second).state, at(engine, "enemy", "day"));
    expect(ended.events.filter((event) => event.kind === "effectEnded")).toHaveLength(2);
    expect(ended.state.floating).toEqual([]);
    expect(costNow(ended.state, courser, "player")).toBe(3);
  });

  it("takes a whole non-negative energy amount", () => {
    const node = modifyCardCost(returnToHand(self()), { set: 0 });
    expect(node).toMatchObject({ op: "modifyCardCost", mode: "set", amount: 0, duration: null });
    expect(() => modifyCardCost(returnToHand(self()), { increase: -1 })).toThrow();
    expect(() => modifyCardCost(returnToHand(self()), { set: 0.5 })).toThrow();
  });
});
