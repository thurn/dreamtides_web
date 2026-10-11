/** Filtered draws use ordinary draw contracts and disclose no skipped cards or hidden removal position. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, discardCost, energy, energyX, event, exhaustSelf } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { triggered, whenDraw, whenYouPlay } from "../../../dsl/triggers";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import type { CardId, InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { drawMatching } from "../draw-matching";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { sequence } from "../sequence";

function fixture(index: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition {
  return { id: syntheticId(0x8d00 + index), cardType: character ? "character" : "event", costs: [energy(0)], spark: character ? 1 : null, subtype: character ? "Warrior" : "", speed: "standard", status: "authored", abilities };
}
const small = fixture(0, () => [event(drawMatching({ cardType: "character", costAtMost: 2 }))]);
const warrior = fixture(1, () => [event(drawMatching({ cardType: "character", subtype: "Warrior", costAtLeast: 1, costAtMost: 2 }))]);
const theirEvent = fixture(2, () => [event(drawMatching({ cardType: "event" }, "opponent"))]);
const watcher = fixture(3, () => [triggered(whenDraw(), gainPoints(1))], true);
const pauseAfter = fixture(4, () => [event(sequence(drawMatching({ cardType: "character", costAtMost: 2 }), optional(gainPoints(1))))]);
const payBefore = fixture(5, () => [activated([exhaustSelf(), discardCost()], drawMatching({ cardType: "character" }))], true);
const emptyTwice = fixture(6, () => [event(sequence(drawMatching({ cardType: "character" }), drawMatching({ cardType: "event" })))]);
const ordinary = fixture(7, () => [event(drawMatching({}))]);
const hiddenTrigger = fixture(8, () => [triggered(whenYouPlay({ cardType: "event" }), drawMatching({ cardType: "character", costAtMost: 2 }), { zone: "any", oncePerTurn: true })], true);
const monster: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x8d09), subtype: "Monster" };
const opaque: EngineCardDefinition = {
  ...fixture(10, () => []),
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, drawMatching({ cardType: "character", costAtMost: 2 }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
  } },
};
const failure: EngineCardDefinition = {
  ...opaque, id: syntheticId(0x8d0b),
  synthetic: { resolve(ctx, item) {
    opaque.synthetic!.resolve!(ctx, item);
    throw new Error("synthetic failure after matching draw");
  } },
};
const xCard: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x8d0c), costs: [energyX()] };
const zero = fixture(13, () => [event(drawMatching({ cardType: "character", costAtMost: 0 }))]);
const engine = createEngine(testCatalog([xCard, zero, small, warrior, theirEvent, watcher, pauseAfter, payBefore, emptyTwice, ordinary, hiddenTrigger, monster, opaque, failure]));
const filler = Array.from({ length: 4 }, () => v.vanilla1.id);
function board(card: CardId = small.id, deck: readonly CardId[] = [v.event0.id, v.vanilla1.id, v.event1.id]) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card], deck }, enemy: { deck: filler } });
}
const play = (id: InstanceId) => ({ kind: "play" as const, card: id, from: "hand" as const });
function run(state: BattleState, card: InstanceId) {
  const result = engine.apply(state, "player", play(card), NO_PROMPTS);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
const slice = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("drawMatching", () => {
  it("draws the first type/subtype/copiable-cost match, counts and announces one real draw, and fires whenDraw", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { hand: [warrior.id], back: [watcher.id], deck: [v.event0.id, monster.id, v.vanilla0.id, v.vanilla3.id, v.vanilla2.id, v.vanilla1.id] }, enemy: { deck: filler },
    });
    const before = [...ids.player.deck], chosen = before[4];
    const result = run(state, ids.player.hand[0]);
    expect(result.state.sides.player.hand).toEqual([chosen]);
    expect(result.state.sides.player.deck).toEqual(before.filter((id) => id !== chosen));
    expect(result.state.turnLog.drawn).toEqual({ player: 1, enemy: 0 });
    expect(result.state.sides.player.score).toBe(1);
    const drawn = result.events.filter((e) => e.kind === "cardDrawn");
    expect(drawn).toEqual([{ kind: "cardDrawn", side: "player", instance: chosen }]);
    expect(eventSeenBy(drawn[0], "enemy", result.state)).toEqual({ kind: "cardDrawn", side: "player", instance: null });
    expect(result.events.some((e) => e.kind === "lookedAtTop" || e.kind === "shuffledIntoDeck")).toBe(false);
    expect(result.state.rng).toEqual(state.rng);
  });

  it("draws for the instructed player, with their draw count and triggers and no identity disclosure to the other player", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [theirEvent.id], deck: filler }, enemy: { back: [watcher.id], deck: [v.vanilla1.id, v.event1.id, v.event0.id] } });
    const result = run(state, ids.player.hand[0]);
    expect(result.state.sides.enemy.hand).toEqual([ids.enemy.deck[1]]);
    expect(result.state.sides.enemy.deck).toEqual([ids.enemy.deck[0], ids.enemy.deck[2]]);
    expect(result.state.turnLog.drawn).toEqual({ player: 0, enemy: 1 });
    expect(result.state.sides.enemy.score).toBe(1);
    expect(engine.view(result.state, "player").sides.enemy.hand).toEqual({ count: 1, known: [] });
  });

  it("uses variant type and copiable cost, including X as zero", () => {
    const { state, ids } = board(small.id, [v.event1.id, v.vanilla3.id, v.vanilla1.id]);
    const converted = ids.player.deck[0];
    state.instances[converted] = { ...state.instances[converted], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } } };
    expect(run(state, ids.player.hand[0]).state.sides.player.hand).toEqual([converted]);
    const reduced = board(small.id, [v.vanilla3.id, v.vanilla1.id]);
    const first = reduced.ids.player.deck[0];
    reduced.state.instances[first] = { ...reduced.state.instances[first], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1 } } };
    expect(run(reduced.state, reduced.ids.player.hand[0]).state.sides.player.hand).toEqual([first]);
    const variable = board(zero.id, [v.vanilla1.id, xCard.id]);
    expect(run(variable.state, variable.ids.player.hand[0]).state.sides.player.hand).toEqual([variable.ids.player.deck[1]]);
  });

  it("does nothing with a nonempty deck without a match, and each empty-deck instruction causes ordinary Fatigue", () => {
    const none = board(small.id, [v.event0.id, v.vanilla3.id]);
    none.state.knownTo.enemy = [...none.ids.player.deck];
    const missed = run(none.state, none.ids.player.hand[0]);
    expect(missed.state.sides.player.deck).toEqual(none.ids.player.deck);
    expect(missed.state.knownTo.enemy).toEqual(none.ids.player.deck);
    expect(missed.state.turnLog.drawn.player).toBe(0);
    expect(missed.events.some((e) => e.kind === "cardDrawn" || e.kind === "fatigue")).toBe(false);
    const empty = board(emptyTwice.id, []);
    const result = run(empty.state, empty.ids.player.hand[0]);
    expect(result.events.filter((e) => e.kind === "fatigue")).toEqual([{ kind: "fatigue", side: "player", points: 1 }, { kind: "fatigue", side: "player", points: 2 }]);
    expect(result.state.sides.enemy.score).toBe(3);
    expect(result.state.turnLog.drawn.player).toBe(0);
  });

  it("forgets an ambiguous unknown removal's index equally across hidden-deck permutations", () => {
    const attempt = (deck: readonly CardId[]) => {
      const { state, ids } = board(small.id, deck);
      state.knownTo.enemy = [ids.player.deck[1]];
      const result = run(state, ids.player.hand[0]);
      expect(engine.view(result.state, "enemy").sides.player.deck).toEqual({ count: 2, known: [] });
      return engine.view(result.state, "enemy");
    };
    expect(attempt([v.vanilla1.id, v.event0.id, v.event1.id])).toEqual(attempt([v.event1.id, v.event0.id, v.vanilla1.id]));
  });

  it("keeps forced skipped positions and the bound from the first publicly known matching card", () => {
    const { state, ids } = board(small.id, [v.event0.id, v.vanilla1.id, v.vanilla2.id, v.event1.id]);
    state.knownTo.enemy = [ids.player.deck[0], ids.player.deck[2]];
    const result = run(state, ids.player.hand[0]);
    expect(engine.view(result.state, "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[0], index: 0 }, { id: ids.player.deck[2], index: 1 }]);
  });

  it("keeps exact known removals and ordinary top draws, including when the source filter is unrestricted", () => {
    for (const card of [small.id, ordinary.id]) {
      const { state, ids } = board(card, [v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id]);
      state.knownTo.enemy = [ids.player.deck[1], ids.player.deck[2]];
      const result = run(state, ids.player.hand[0]);
      const known = engine.view(result.state, "enemy").sides.player.deck.known;
      expect(known).toEqual(card === small.id ? [{ id: ids.player.deck[2], index: 1 }] : [{ id: ids.player.deck[1], index: 0 }, { id: ids.player.deck[2], index: 1 }]);
    }
  });

  it("uses anonymous removal bounds when the filter comes from a hidden source or an opaque resolver", () => {
    const hidden = board(v.event0.id, [hiddenTrigger.id, v.vanilla1.id, v.event1.id]);
    hidden.state.knownTo.enemy = [hidden.ids.player.deck[1]];
    const after = run(hidden.state, hidden.ids.player.hand[0]);
    expect(after.state.sides.player.hand).toEqual([hidden.ids.player.deck[0]]);
    expect(engine.view(after.state, "enemy").sides.player.deck.known).toEqual([]);
    const unknownFilter = board(opaque.id, [v.vanilla1.id, v.vanilla2.id, v.event1.id]);
    unknownFilter.state.knownTo.enemy = [unknownFilter.ids.player.deck[1]];
    expect(engine.view(run(unknownFilter.state, unknownFilter.ids.player.hand[0]).state, "enemy").sides.player.deck.known).toEqual([]);
  });

  it("rolls back a failed resolution's draw/count/knowledge changes, preserving the committed play and publishing no partial draw", () => {
    const { state, ids } = board(failure.id);
    state.knownTo.enemy = [ids.player.deck[2]];
    const adapter = createFoldAdapter(engine);
    const outcome = adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a failed matching draw resolution");
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.turnLog.drawn.player).toBe(0);
    expect(outcome.slice.committed.knownTo.enemy).toEqual(state.knownTo.enemy);
    expect(outcome.slice.committed.stack).toHaveLength(1);
    expect(outcome.published.some((e) => e.kind === "cardDrawn")).toBe(false);
    expect(adapter.pending(outcome.slice)).toBeNull();
    expect(state.sides.player.hand).toEqual(ids.player.hand);
  });

  it("replays a suspended draw prefix after JSON reload and accepts one owning answer while rejecting wrong-side/stale/concurrent answers", () => {
    const { state, ids } = board(pauseAfter.id);
    state.knownTo.enemy = [ids.player.deck[2]];
    const adapter = createFoldAdapter(engine);
    const suspended = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const pending = adapter.pending(suspended)!;
    expect(pending.prompt).toMatchObject({ kind: "confirm", cancellable: false });
    expect(pending.display.sides.player.hand).toEqual([ids.player.deck[1]]);
    expect(pending.display.turnLog.drawn.player).toBe(1);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(engine.catalog));
    expect(fresh.pending(reloaded)).toEqual(pending);
    const before = stateHash(reloaded.committed);
    expect(fresh.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: true }).kind).toBe("bounced");
    expect(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] }).kind).toBe("bounced");
    expect(stateHash(reloaded.committed)).toBe(before);
    const accepted = applied(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true }));
    const expected = engine.apply(state, "player", play(ids.player.hand[0]), new ScriptedSource([true])).state;
    expect(stateHash(accepted.committed)).toBe(stateHash(expected));
    expect(accepted.committed.turnLog.drawn.player).toBe(1);
    expect(fresh.reduce(accepted, { kind: "answer", side: "player", promptId: pending.prompt.id, value: false }).kind).toBe("bounced");
  });

  it("cancels an unpaid discard cost before the primitive runs; a committed effect's prompt cannot cancel its draw", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [payBefore.id], hand: [v.event0.id, v.vanilla1.id], deck: filler }, enemy: { deck: filler } });
    const adapter = createFoldAdapter(engine), start = slice(state);
    const cost = applied(adapter.reduce(start, { kind: "battleAction", side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }));
    const pending = adapter.pending(cost)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", cancellable: true, purpose: { role: "discardCost" } });
    expect(applied(adapter.reduce(cost, { kind: "cancel", side: "player", promptId: pending.prompt.id })).committed).toEqual(state);
    const next = board(pauseAfter.id);
    const suspended = applied(adapter.reduce(slice(next.state), { kind: "battleAction", side: "player", action: play(next.ids.player.hand[0]) }));
    expect(adapter.reduce(suspended, { kind: "cancel", side: "player", promptId: adapter.pending(suspended)!.prompt.id }).kind).toBe("bounced");
  });
});
