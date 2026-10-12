/**
 * "When you materialize your second spirit animal in a turn" and "When you
 * materialize a spirit animal, if it is not the first …" (`whenMaterialize`
 * with `nth`; rules § Ability Types → Counting materializations;
 * RD-hv-umm2.107-1, RD-hv-umm2.107-2), on synthetic cards: a materialization
 * matched by its place among the materializations its side announced this
 * turn, counted from the turn log by type as each materialized.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { all, characterYouControl, energy, event, target } from "../../../dsl/builders";
import { triggered, whenMaterialize } from "../../../dsl/triggers";
import type { CharacterSelector } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { materializedThisTurn } from "../../../rules/turn-log";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { battleSeed, parseFigmentId, type AbilitySource, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import { drawMatching } from "../draw-matching";
import { floating } from "../floating-trigger";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { giveAllTypes } from "../give-all-types";
import { materializeFigments } from "../materialize-figments";
import { optional } from "../optional";
import { rematerialize } from "../rematerialize";
import { returnToHand } from "../return-to-hand";

const SPIRIT = "Spirit Animal";
const spirits = (extra: Omit<CharacterSelector, "controller"> = {}) => characterYouControl({ subtype: SPIRIT, ...extra });

function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return {
    id: syntheticId(0x10700 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities, ...extra,
  };
}

const spiritFigment: EngineFigmentDefinition = {
  id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000010780"), subtype: SPIRIT, spark: 1, status: "authored", abilities: () => [],
};

const M = {
  /** A vanilla spirit animal. */
  spirit: card(0, "character", () => [], { subtype: SPIRIT, status: "vanilla" }),
  /** A vanilla warrior. */
  warrior: card(1, "character", () => [], { status: "vanilla" }),
  /** A warrior: "When you materialize your second spirit animal in a turn, gain 1⍟." */
  second: card(2, "character", () => [triggered(whenMaterialize(spirits(), 2), gainPoints(1))]),
  /** A warrior: "When you materialize a spirit animal, if it is not the first spirit animal you have materialized this turn, gain 1●." */
  later: card(3, "character", () => [triggered(whenMaterialize(spirits(), { atLeast: 2 }), gainEnergy(1))]),
  /** A spirit animal: "When you materialize a spirit animal, gain 1●. When you materialize your second spirit animal in a turn, draw a spirit animal." */
  panther: card(4, "character", () => [
    triggered(whenMaterialize(spirits()), gainEnergy(1)),
    triggered(whenMaterialize(spirits(), 2), drawMatching({ subtype: SPIRIT })),
  ], { subtype: SPIRIT }),
  /** A warrior: "When you materialize your second non-spirit-animal character in a turn, gain 1⍟." */
  otherSecond: card(5, "character", () => [triggered(whenMaterialize(characterYouControl({ notSubtype: SPIRIT }), 2), gainPoints(1))]),
  /** A warrior: "When the opponent materializes their second spirit animal in a turn, gain 1⍟." */
  theirSecond: card(6, "character", () => [triggered(whenMaterialize({ controller: "opponent", subtype: SPIRIT }, 2), gainPoints(1))]),
  /** A warrior: "When you materialize your second spirit animal in a turn, you may gain 1●." */
  maySecond: card(7, "character", () => [triggered(whenMaterialize(spirits(), 2), optional(gainEnergy(1)))]),
  /** A spirit animal with Interrupt speed, for responses. */
  quickSpirit: card(8, "character", () => [], { subtype: SPIRIT, speed: "interrupt", status: "vanilla" }),
  /** "Materialize three spirit animal figments." */
  pack: card(9, "event", () => [event(materializeFigments(spiritFigment.id, 3))]),
  /** "Return each spirit animal you control to hand." */
  recall: card(10, "event", () => [event(returnToHand(all(spirits())))]),
  /** "Rematerialize a character you control." */
  resurge: card(11, "event", () => [event(rematerialize(target(characterYouControl())))]),
  /** "Characters you control gain all character types this turn." */
  blend: card(12, "event", () => [event(giveAllTypes(all(characterYouControl()), "untilEndOfTurn"))]),
  /** "Until end of turn, when you materialize your second spirit animal in a turn, gain 1⍟." */
  floatingSecond: card(13, "event", () => [event(floating(whenMaterialize(spirits(), 2), gainPoints(1)))]),
  /** Materializes a spirit animal figment, then fails. */
  failing: card(14, "event", () => [], {
    synthetic: {
      resolve(ctx, item) {
        resolveEffect(ctx, materializeFigments(spiritFigment.id, 1), {
          source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
          controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
        });
        throw new Error("synthetic failure after a materialization");
      },
    },
  }),
} as const;

const E = createEngine(testCatalog(Object.values(M), {}, [spiritFigment]));
const filler = Array.from({ length: 6 }, () => M.warrior.id);

function setup(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(E.catalog, { active: "player", phase: "day", player: { deck: filler, energy: 5, ...player }, enemy: { deck: filler, energy: 5, ...enemy } });
}
function settled(state: BattleState, events: readonly EngineEvent[], source: AnswerSource) {
  const rest = passUntil(E, state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  return { state: rest.state, events: [...events, ...rest.events] };
}
/** Plays `card` from `side`'s hand and passes until the stack and the trigger queue are empty. */
function play(state: BattleState, card: InstanceId | null | undefined, side: Side = "player", source: AnswerSource = NO_PROMPTS) {
  const cast = E.apply(state, side, { kind: "play", card: card!, from: "hand" }, source);
  return settled(cast.state, cast.events, source);
}
/** Plays each card in turn from the player's hand, collecting every event. */
function playAll(state: BattleState, cards: readonly (InstanceId | null | undefined)[]) {
  return cards.reduce<{ state: BattleState; events: EngineEvent[] }>((done, next) => {
    const step = play(done.state, next);
    return { state: step.state, events: [...done.events, ...step.events] };
  }, { state, events: [] });
}
/** The subject of each trigger `source` queued, in order. */
function fired(events: readonly EngineEvent[], source: AbilitySource | null | undefined, ability = 0): (InstanceId | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" && entry.source === source && entry.ability === ability ? [entry.subject] : []));
}
const announced = (events: readonly EngineEvent[]) => events.flatMap((entry) => (entry.kind === "materialized" ? [entry.instance] : []));
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
};
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("whenMaterialize with nth", () => {
  it("matches only the nth matching materialization this turn, the one just announced included, or each from it on", () => {
    const { state, ids } = setup({ back: [M.second.id, M.later.id, M.spirit.id], hand: [M.warrior.id, M.spirit.id, M.spirit.id, M.spirit.id] });
    const [second, later] = ids.player.back;
    const [warrior, a, b, c] = ids.player.hand;
    const result = playAll(state, [warrior, a, b, c]);
    // Characters placed before the turn, and a warrior, were not materialized as spirit animals this turn.
    expect(fired(result.events, second)).toEqual([b]);
    expect(fired(result.events, later)).toEqual([b, c]);
    expect(result.state.sides.player.score).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(7);
    expect(materializedThisTurn(result.state, "player").map((entry) => entry.instance)).toEqual([warrior, a, b, c]);
  });

  it("counts materializations from before its card entered play, its own included", () => {
    const { state, ids } = setup({ hand: [M.spirit.id, M.panther.id], deck: [M.warrior.id, M.spirit.id, M.warrior.id] });
    const [a, panther] = ids.player.hand;
    const [topWarrior, deckSpirit] = ids.player.deck;
    const result = playAll(state, [a, panther]);
    expect(fired(result.events, panther, 0)).toEqual([panther]);
    expect(fired(result.events, panther, 1)).toEqual([panther]);
    expect(result.state.sides.player.hand).toEqual([deckSpirit]);
    expect(result.state.sides.player.deck[0]).toBe(topWarrior);
    expect(result.state.sides.player.currentEnergy).toBe(6);
  });

  it("counts figments one at a time in announcement order, characters that left play, and rematerializations", () => {
    const pack = setup({ back: [M.second.id, M.later.id], hand: [M.pack.id] });
    const [second, later] = pack.ids.player.back;
    const packed = play(pack.state, pack.ids.player.hand[0]);
    const figments = announced(packed.events);
    expect(figments).toHaveLength(3);
    expect(fired(packed.events, second)).toEqual([figments[1]]);
    expect(fired(packed.events, later)).toEqual(figments.slice(1));

    const left = setup({ back: [M.second.id], hand: [M.spirit.id, M.recall.id] });
    const [a] = left.ids.player.hand;
    const recalled = playAll(left.state, [a, left.ids.player.hand[1]]);
    expect(recalled.state.instances[a]?.zone).toBe("hand");
    const again = play(recalled.state, a);
    expect(fired([...recalled.events, ...again.events], left.ids.player.back[0])).toEqual([a]);

    const repeat = setup({ back: [M.second.id, M.spirit.id], hand: [M.resurge.id, M.resurge.id] });
    const [watcher, placed] = repeat.ids.player.back;
    const pick = new ScriptedSource([[placed!], [placed!]]);
    const once = play(repeat.state, repeat.ids.player.hand[0], "player", pick);
    expect(fired(once.events, watcher)).toEqual([]);
    const twice = play(once.state, repeat.ids.player.hand[1], "player", pick);
    expect(fired(twice.events, watcher)).toEqual([placed]);
  });

  it("matches each materialization by its type as it materialized", () => {
    const { state, ids } = setup({ back: [M.second.id], hand: [M.warrior.id, M.blend.id, M.spirit.id, M.resurge.id] });
    const [second] = ids.player.back;
    const [warrior, blend, spirit, resurge] = ids.player.hand;
    // The warrior gains all character types after it materialized: its materialization still was not a spirit animal's.
    const typed = playAll(state, [warrior, blend, spirit]);
    expect(fired(typed.events, second)).toEqual([]);
    // Rematerialized with all character types, it is a spirit animal's second materialization.
    const again = play(typed.state, resurge, "player", new ScriptedSource([[warrior]]));
    expect(fired(again.events, second)).toEqual([warrior]);
    expect(materializedThisTurn(again.state, "player").map((entry) => entry.allTypes)).toEqual([false, false, true]);

    const other = setup({ back: [M.otherSecond.id], hand: [M.warrior.id, M.spirit.id, M.blend.id, M.resurge.id, M.warrior.id] });
    const [watcher] = other.ids.player.back;
    const [first, spiritAnimal, blending, resurging, last] = other.ids.player.hand;
    const before = playAll(other.state, [first, spiritAnimal, blending]);
    // A character with all character types is of every type, so it is never a non-spirit animal.
    const blended = play(before.state, resurging, "player", new ScriptedSource([[first]]));
    expect(fired([...before.events, ...blended.events], watcher)).toEqual([]);
    const after = play(blended.state, last);
    expect(fired(after.events, watcher)).toEqual([last]);
  });

  it("counts each side's materializations for that side, the opponent's responses included", () => {
    const { state, ids } = setup(
      { back: [M.second.id, M.theirSecond.id], hand: [M.spirit.id, M.spirit.id] },
      { back: [M.second.id], hand: [M.quickSpirit.id, M.quickSpirit.id] },
    );
    const [mine, theirs] = ids.player.back;
    const [enemyWatcher] = ids.enemy.back;
    const [a, b] = ids.player.hand;
    const [x, y] = ids.enemy.hand;
    const respond = (start: BattleState, card: InstanceId, response: InstanceId | undefined) => {
      const cast = E.apply(start, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
      const answered = E.apply(cast.state, "enemy", { kind: "play", card: response!, from: "hand" }, NO_PROMPTS);
      return settled(answered.state, [...cast.events, ...answered.events], NO_PROMPTS);
    };
    const first = respond(state, a, x);
    const result = respond(first.state, b, y);
    const events = [...first.events, ...result.events];
    expect(announced(events)).toEqual([x, a, y, b]);
    expect(fired(events, mine)).toEqual([b]);
    expect(fired(events, enemyWatcher)).toEqual([y]);
    expect(fired(events, theirs)).toEqual([y]);
    expect(materializedThisTurn(result.state, "enemy").map((entry) => entry.instance)).toEqual([x, y]);
  });

  it("starts counting again each turn, and works as a floating trigger", () => {
    const { state, ids } = setup({ back: [M.second.id], hand: [M.spirit.id, M.floatingSecond.id, M.spirit.id], deck: [M.spirit.id, M.spirit.id, ...filler] });
    const [second] = ids.player.back;
    const [a, floater] = ids.player.hand;
    const turn = playAll(state, [a, floater]);
    const enemyDay = passUntil(E, turn.state, at(E, "enemy", "day"), NO_PROMPTS, 80).state;
    const nextDay = passUntil(E, enemyDay, at(E, "player", "day"), NO_PROMPTS, 80).state;
    expect(materializedThisTurn(nextDay, "player")).toEqual([]);
    expect(nextDay.floating.filter((effect) => effect.change.kind === "trigger")).toEqual([]);
    const fresh = play(nextDay, ids.player.hand[2]);
    expect(fired(fresh.events, second)).toEqual([]);

    const floatingTurn = setup({ hand: [M.floatingSecond.id, M.spirit.id, M.spirit.id] });
    const [cast, first, next] = floatingTurn.ids.player.hand;
    const done = playAll(floatingTurn.state, [cast, first, next]);
    expect(done.events.filter((entry) => entry.kind === "triggerQueued").map((entry) => entry.subject)).toEqual([next]);
    expect(done.state.sides.player.score).toBe(1);
  });

  it("refuses a counted subject a materialization record cannot answer, and a count below one", () => {
    expect(whenMaterialize()).toEqual({ on: "materialize", subject: { controller: "you" } });
    expect(whenMaterialize(spirits(), { atLeast: 2 })).toEqual({ on: "materialize", subject: { controller: "you", subtype: SPIRIT }, nth: { atLeast: 2 } });
    const subjects = ["self", spirits({ figment: true }), spirits({ another: true }), spirits({ costAtMost: 2 }), spirits({ exhausted: false })] as const;
    for (const subject of subjects) expect(() => whenMaterialize(subject as never, 2), JSON.stringify(subject)).toThrow();
    for (const nth of [0, -1, 1.5, Number.NaN, { atLeast: 0 }, { atLeast: 2.5 }]) expect(() => whenMaterialize(spirits(), nth), JSON.stringify(nth)).toThrow();
  });
});

describe("whenMaterialize with nth: recovery", () => {
  it("counts nothing from a step that failed after materializing, and queues nothing for it", () => {
    const { state, ids } = setup({ back: [M.second.id], hand: [M.spirit.id, M.failing.id] }, { hand: [M.quickSpirit.id] });
    const [a, failing] = ids.player.hand;
    const first = play(state, a).state;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(first), { kind: "battleAction", side: "player", action: { kind: "play", card: failing, from: "hand" } }));
    const outcome = fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (outcome.kind !== "applied") throw new Error("expected an applied intent with an error");
    // The figment would have been the second spirit animal; the failed step leaves neither its record nor its trigger.
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(cast.committed);
    expect(materializedThisTurn(outcome.slice.committed, "player").map((entry) => entry.instance)).toEqual([a]);
    expect(outcome.slice.committed.triggerQueue).toEqual([]);
  });

  it("resolves a queued nth trigger's prompt once across a reload, bouncing stale and foreign answers", () => {
    const { state, ids } = setup({ back: [M.maySecond.id], hand: [M.spirit.id, M.spirit.id] }, { hand: [M.quickSpirit.id] });
    const [a, b] = ids.player.hand;
    const first = play(state, a).state;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(first), { kind: "battleAction", side: "player", action: { kind: "play", card: b, from: "hand" } }));
    const suspended = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const pending = fold.pending(suspended);
    if (pending === null) throw new Error("expected the optional energy prompt");
    expect(pending.prompt.kind).toBe("confirm");
    expect(pending.display.turnLog.materialized?.player.map((entry) => entry.instance)).toEqual([a, b]);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const done = applied(fresh.reduce(reloaded, answer));
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.currentEnergy).toBe(first.sides.player.currentEnergy + 1);
    expect(stateHash(applied(fold.reduce(suspended, answer)).committed)).toBe(stateHash(done.committed));
  });

  it("counts from the load on a state saved without the record", () => {
    const { state, ids } = setup({ back: [M.second.id], hand: [M.spirit.id, M.spirit.id, M.spirit.id] });
    const [second] = ids.player.back;
    const [a, b, c] = ids.player.hand;
    const earlier = play(state, a).state;
    const { materialized: _materialized, ...older } = earlier.turnLog;
    const result = playAll({ ...earlier, turnLog: older }, [b, c]);
    expect(fired(result.events, second)).toEqual([c]);
  });

  it("matches the same in a determinization that cannot identify an earlier materialized card", () => {
    const { state, ids } = setup({ back: [M.second.id], hand: [M.spirit.id, M.recall.id, M.spirit.id] });
    const [second] = ids.player.back;
    const [a, recall, b] = ids.player.hand;
    const turn = playAll(state, [a, recall]).state;
    // The enemy no longer identifies the recalled spirit animal in the player's hand, but was shown the other.
    const hidden: BattleState = { ...turn, knownTo: { ...turn.knownTo, enemy: [...turn.knownTo.enemy.filter((id) => id !== a), b] } };
    const decklists = {
      player: [M.second, M.spirit, M.recall, M.spirit, ...filler.map(() => M.warrior)].map(({ id }) => ({ cardId: id })),
      enemy: filler.map((cardId) => ({ cardId })),
    };
    const sampled = E.determinize(E.view(hidden, "enemy"), decklists, () => 0.5);
    expect(materializedThisTurn(sampled, "player")).toHaveLength(1);
    expect(materializedThisTurn(sampled, "player")[0]?.instance).not.toBe(a);
    expect(fired(play(sampled, b).events, second)).toEqual([b]);
    expect(fired(play(hidden, b).events, second)).toEqual([b]);
    expect(determinizationDivergences(E, hidden, decklists, battleSeed("materialize-nth"), 0)).toEqual([]);
  });
});
