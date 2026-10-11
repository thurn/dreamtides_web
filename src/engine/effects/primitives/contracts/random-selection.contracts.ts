import { describe, expect, it } from "vitest";
import { battleSeed, opponent, type BattleSeed, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState } from "../../../testing/board";
import { eventRedactionViolations } from "../../../testing/redaction";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { passUntil } from "../../../testing/trigger-harness";
import { engine, fromHand, fromVoid, genesis, leftDeck, mill, mixedDeck, plainDeck, raid, twin, v } from "./random-selection-support";

const STREAM = "random:selection";

function twinBoard(side: Side, deck: readonly (typeof mixedDeck)[number][] = mixedDeck) {
  return boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [twin.id], deck, energy: 5 }, [opponent(side)]: { deck: plainDeck } });
}

describe("randomSelection", () => {
  it.each(["player", "enemy"] as const)("%s materializes two different matching deck cards picked from its stream, in deck order, without shuffling or revealing the rest", (side) => {
    const { state, ids } = twinBoard(side);
    const result = engine.apply(state, side, playFromHand(ids, side).action, NO_PROMPTS);
    const matching = [0, 3, 4, 6].map((index) => ids[side].deck[index]);
    const entered = leftDeck(state, result.state, side);
    expect(entered).toHaveLength(2);
    for (const id of entered) expect(matching).toContain(id);
    expect(result.state.sides[side].backRank.slice(0, 2)).toEqual(entered);
    for (const id of entered) expect(result.state.instances[id]).toMatchObject({ zone: "play", owner: side, controller: side, status: { exhausted: true } });
    expect(result.state.sides[side].deck).toEqual(state.sides[side].deck.filter((id) => !entered.includes(id)));
    expect(result.state.rng[STREAM]).toBe((state.rng[STREAM] ?? 0) + 2);
    expect(result.state.rng[`shuffle:${side}`]).toBe(state.rng[`shuffle:${side}`]);
    expect(result.state.sides[side].score).toBe(1);
    expect(result.events.filter((e) => e.kind === "materialized").map((e) => e.instance)).toEqual(entered);
    expect(result.events.filter((e) => e.kind === "cardPlayed").map((e) => e.instance)).toEqual([ids[side].hand[0]]);
    expect(result.events.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
    for (const viewer of ["player", "enemy"] as const) expect(result.state.knownTo[viewer]).toEqual(state.knownTo[viewer]);
    expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("picks are a function of the battle seed: the same state picks the same cards, and fixed seeds pick different matching pairs", () => {
    const { state, ids } = twinBoard("player");
    const picks = (seed: BattleSeed): string => {
      const seeded: BattleState = { ...structuredClone(state), seed };
      const result = engine.apply(seeded, "player", playFromHand(ids, "player").action, NO_PROMPTS);
      return JSON.stringify(leftDeck(seeded, result.state, "player"));
    };
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map(battleSeed);
    const pairs = seeds.map(picks);
    expect(seeds.map(picks)).toEqual(pairs);
    expect(new Set(pairs).size).toBeGreaterThan(1);
  });

  it("materializes what exists when fewer cards match, and with none draws nothing, names nothing and continues the effect", () => {
    for (const [deck, entering] of [[[v.event0.id, v.vanilla3.id, v.vanilla2.id], 1], [[v.event0.id, v.vanilla3.id], 0], [[], 0]] as const) {
      const { state, ids } = twinBoard("player", deck);
      const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
      const entered = leftDeck(state, result.state, "player");
      expect(entered).toHaveLength(entering);
      if (entering === 1) expect(entered).toEqual([ids.player.deck[2]]);
      expect(result.state.sides.player.backRank.filter(Boolean)).toEqual(entered);
      expect(result.state.rng[STREAM] ?? 0).toBe((state.rng[STREAM] ?? 0) + entering);
      expect(result.events.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
      expect(result.state.sides.player.score).toBe(1);
      expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
    }
  });

  it("reads the deck as the effect resolves: a response that empties it of matches leaves nothing to pick", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [twin.id], deck: mixedDeck, energy: 5 }, enemy: { hand: [mill.id], energy: 1, deck: plainDeck } });
    const played = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    expect(played.state.stack).toHaveLength(1);
    const response = engine.apply(played.state, "enemy", playFromHand(ids, "enemy").action, NO_PROMPTS);
    const done = passUntil(engine, response.state, (next) => next.stack.length === 0);
    expect(done.state.sides.player.deck).toEqual([ids.player.deck[1], ids.player.deck[5]]);
    expect(done.state.sides.player.backRank.filter(Boolean)).toEqual([]);
    expect(done.state.rng[STREAM] ?? 0).toBe(state.rng[STREAM] ?? 0);
    expect(done.state.sides.player.score).toBe(1);
    expect([...response.events, ...done.events].filter((e) => e.kind === "noLegalTarget" || e.kind === "materialized")).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("%s takes from the opponent's deck: the card keeps its owner, enters under the controller, and the controller's deck is untouched", (side) => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [raid.id], deck: mixedDeck }, [opponent(side)]: { deck: [v.event0.id, v.vanilla3.id, v.event1.id] } });
    const result = engine.apply(state, side, playFromHand(ids, side).action, NO_PROMPTS);
    const taken = ids[opponent(side)].deck[1];
    expect(result.state.instances[taken]).toMatchObject({ zone: "play", owner: opponent(side), controller: side });
    expect(result.state.sides[side].backRank[0]).toBe(taken);
    expect(result.state.sides[side].deck).toEqual(state.sides[side].deck);
    expect(result.state.sides[opponent(side)].deck).toEqual([ids[opponent(side)].deck[0], ids[opponent(side)].deck[2]]);
    expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("picks among matching void or hand cards too, leaving the other cards where they were", () => {
    for (const card of [fromVoid, fromHand]) {
      const zone = card === fromVoid ? "void" : "hand";
      const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id, ...(zone === "hand" ? [v.event0.id, v.vanilla2.id] : [])], void: [v.event1.id, v.vanilla3.id], deck: mixedDeck }, enemy: { deck: plainDeck } });
      const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
      const expected = zone === "void" ? ids.player.void[1] : ids.player.hand[2];
      expect(result.state.sides.player.backRank[0]).toBe(expected);
      expect(result.state.sides.player.deck).toEqual(state.sides.player.deck);
      expect(result.state.rng[STREAM]).toBe((state.rng[STREAM] ?? 0) + 1);
      expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
      expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    }
  });
});

describe("randomSelection cost bound read from a paid abandon", () => {
  const board = (hand: boolean, deck: readonly (typeof mixedDeck)[number][]) => boardState(engine.catalog, {
    active: "player", phase: "day",
    player: { ...(hand ? { hand: [genesis.id] } : { void: [genesis.id] }), back: [v.vanilla2.id, v.vanilla5.id], deck, energy: 5 },
    enemy: { deck: plainDeck },
  });

  it("materializes only a character whose cost is above the abandoned character's captured cost, never an equal or lower one", () => {
    const { state, ids } = board(true, [v.vanilla2.id, v.vanilla1.id, v.vanilla3.id, v.event1.id, v.vanilla2.id]);
    const abandoned = ids.player.back[0]!;
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[abandoned]]));
    expect(result.state.instances[abandoned].zone).toBe("void");
    expect(result.state.sides.player.backRank.filter(Boolean)).toEqual([ids.player.deck[2], ids.player.back[1]]);
    expect(result.state.sides.player.currentEnergy).toBe(3);
    expect(result.state.rng[STREAM]).toBe((state.rng[STREAM] ?? 0) + 1);
    const none = board(true, [v.vanilla2.id, v.vanilla1.id, v.event1.id]);
    const empty = engine.apply(none.state, "player", playFromHand(none.ids, "player").action, new ScriptedSource([[none.ids.player.back[0]!]]));
    expect(empty.state.sides.player.deck).toEqual(none.state.sides.player.deck);
    expect(empty.state.sides.player.backRank.filter(Boolean)).toEqual([none.ids.player.back[1]]);
    expect(empty.state.rng[STREAM] ?? 0).toBe(none.state.rng[STREAM] ?? 0);
  });

  it("keeps the captured cost on the stack item, abandoning a costlier character excludes cheaper picks, and Reclaim still pays and captures the abandon", () => {
    const { state, ids } = board(true, [v.vanilla3.id, v.vanilla5.id, v.vanilla8.id]);
    const played = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[ids.player.back[1]!]]));
    expect(played.state.instances[ids.player.back[1]!].zone).toBe("void");
    expect(played.state.sides.player.backRank.filter(Boolean)).toEqual([ids.player.back[0], ids.player.deck[2]]);
    const reclaimed = board(false, [v.vanilla1.id, v.vanilla3.id]);
    const route = engine.legalActions(reclaimed.state, "player").find((action) => action.kind === "play" && action.from === "void");
    if (route === undefined) throw new Error("expected a Reclaim play");
    const result = engine.apply(reclaimed.state, "player", route, new ScriptedSource([[reclaimed.ids.player.back[0]!]]));
    expect(result.state.instances[reclaimed.ids.player.back[0]!].zone).toBe("void");
    expect(result.state.sides.player.backRank.filter(Boolean)).toEqual([reclaimed.ids.player.deck[1], reclaimed.ids.player.back[1]]);
    expect(result.state.sides.player.currentEnergy).toBe(2);
    expect(result.state.instances[reclaimed.ids.player.void[0]].zone).toBe("banished");
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });
});
