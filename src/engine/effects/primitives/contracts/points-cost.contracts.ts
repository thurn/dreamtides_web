/**
 * "Pay N⍟" as a cost (`pointsCost`), on synthetic cards: the payer's score
 * drops by exactly N with the play, announced as a loss of points; a cost
 * the payer cannot pay in full makes the play, the activation, the
 * alternative, or the optional cost unavailable; and the payment survives
 * reload, refuses stale and foreign input, and commits with the play or not
 * at all.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, additionalCost, choiceCost, discardCost, energy, event, optionalCost, pointsCost } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseModePrompt, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { payCosts, planCosts, type NonEnergyCost } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";

const synthetic = (index: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "standard", status: "authored", abilities, ...extra,
});

/** A 2● 7-spark character: "To play this character, pay 4⍟." */
const pricedCharacter = synthetic(1400, () => [additionalCost(pointsCost(4))], { cardType: "character", costs: [energy(2)], spark: 7, subtype: "Visitor" });
/** "To play this event, discard a card or pay 3⍟. Gain 2●." */
const discardOrPoints = synthetic(1401, () => [additionalCost(choiceCost([discardCost()], [pointsCost(3)])), event(gainEnergy(2))]);
/** "You may pay 2⍟ to play this event. Gain 2●." */
const optionalPoints = synthetic(1402, () => [additionalCost(optionalCost(pointsCost(2))), event(gainEnergy(2))]);
/** A character with "Pay 2⍟: Draw a card." */
const pointsActivator = synthetic(1403, () => [activated([pointsCost(2)], draw(1))], { cardType: "character", costs: [energy(1)], spark: 1, subtype: "Warrior" });
/** "To play this event, discard a card or pay 3⍟. You may pay 2⍟ to play it. Gain 2●." */
const twoPointCosts = synthetic(1406, () => [
  additionalCost(choiceCost([discardCost()], [pointsCost(3)])),
  additionalCost(optionalCost(pointsCost(2))),
  event(gainEnergy(2)),
]);
/** Plans a 4⍟ cost, pays it after the commit point, then its rules code fails. */
const failsAfterPaying = synthetic(1404, () => [], {
  synthetic: {
    play(ctx, source) {
      const plan = planCosts(ctx, "player", source, [pointsCost(4)], null, (role) => ({ source, cardId: syntheticId(1404), ability: 0, role }), [source]);
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      throw new Error("synthetic failure after the payment");
    },
  },
});
/** Pays a forged plan for more ⍟ than its payer has. */
const overpays = synthetic(1405, () => [], {
  synthetic: {
    play(ctx, source) {
      ctx.commitPoint();
      const cost: NonEnergyCost = { cost: "points", amount: 5 };
      payCosts(ctx, "player", source, { x: null, energy: { fixed: 0, x: 0 }, payments: [{ cost, cards: [] }], optionalPaid: [] });
      throw new Error("paid more ⍟ than the payer has");
    },
  },
});

const engine = createEngine(testCatalog([pricedCharacter, discardOrPoints, optionalPoints, pointsActivator, failsAfterPaying, overpays, twoPointCosts]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

/** The enemy holds an Interrupt, so the played item waits on the stack until the enemy passes. */
const board = (player: SideSetup, enemy: SideSetup = {}) =>
  boardState(engine.catalog, { active: "player", phase: "day", player: { deck, energy: 3, ...player }, enemy: { deck, hand: [v.interruptEvent.id], energy: 5, score: 6, ...enemy } });

/** Answers prompts from a script, keeping each prompt it was asked. */
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly answers: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.answers[this.next++];
    if (value === undefined) throw new Error(`no answer for ${prompt.purpose.role}`);
    return value;
  }
}

function run(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new Recording(answers);
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
}
const play = (card: InstanceId): Action => ({ kind: "play", card, from: "hand" });
const resolve = (state: BattleState) => run(state, "enemy", { kind: "pass" });
const plays = (state: BattleState) => engine.legalActions(state, "player").flatMap((action) => (action.kind === "play" ? [action.card] : []));
const activations = (state: BattleState) => engine.legalActions(state, "player").filter((action) => action.kind === "activate");
const pointEvents = (events: readonly EngineEvent[]) => events.filter((event) => event.kind === "pointsScored");
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

describe("pointsCost", () => {
  it("pays exactly N⍟ after the energy, before the card goes on the stack, and touches no other score", () => {
    for (const score of [4, 9]) {
      const { state, ids } = board({ hand: [pricedCharacter.id], score });
      const card = ids.player.hand[0];
      const paid = run(state, "player", play(card));
      expect(paid.prompts).toEqual([]);
      expect(paid.state.sides.player.score).toBe(score - 4);
      expect(paid.state.sides.player.currentEnergy).toBe(1);
      expect(paid.state.sides.enemy.score).toBe(6);
      expect(paid.state.result).toBeNull();
      expect(paid.state.stack[0]).toMatchObject({ instance: card });
      expect(pointEvents(paid.events)).toEqual([{ kind: "pointsScored", side: "player", amount: -4, cause: "effect" }]);
      const kinds = paid.events.map((entry) => entry.kind);
      expect(kinds.indexOf("energyChanged")).toBeLessThan(kinds.indexOf("pointsScored"));
      const resolved = resolve(paid.state).state;
      expect(resolved.instances[card].zone).toBe("play");
      expect(resolved.sides.player.score).toBe(score - 4);
    }
  });

  it("is unplayable with fewer ⍟ than the cost, whatever else the side can pay", () => {
    const short = board({ hand: [pricedCharacter.id], score: 3, energy: 9 });
    expect(plays(short.state)).toEqual([]);
    const exact = board({ hand: [pricedCharacter.id], score: 4 });
    expect(plays(exact.state)).toEqual([exact.ids.player.hand[0]]);
  });

  it("activates only with the ⍟ in full, and pays them as the ability goes on the stack", () => {
    const short = board({ back: [pointsActivator.id], score: 1 });
    expect(activations(short.state)).toEqual([]);
    const { state, ids } = board({ back: [pointsActivator.id], score: 2 });
    const [action] = activations(state);
    expect(action).toMatchObject({ kind: "activate", source: ids.player.back[0], ability: 0 });
    const paid = run(state, "player", action);
    expect(paid.state.sides.player.score).toBe(0);
    expect(pointEvents(paid.events)).toEqual([{ kind: "pointsScored", side: "player", amount: -2, cause: "effect" }]);
    expect(resolve(paid.state).state.sides.player.hand).toHaveLength(1);
  });

  it("offers the ⍟ alternative only when the side has them all, and pays only the chosen alternative", () => {
    // With 2⍟ only the discard can pay, so the choice answers itself.
    const short = board({ hand: [discardOrPoints.id, v.vanilla1.id, v.vanilla2.id], score: 2 });
    const discarded = run(short.state, "player", play(short.ids.player.hand[0]), [[short.ids.player.hand[1]]]);
    expect(discarded.prompts.map((prompt) => prompt.purpose.role)).toEqual(["discardCost"]);
    expect(discarded.state.sides.player.hand).toEqual([short.ids.player.hand[2]]);
    expect(discarded.state.sides.player.score).toBe(2);
    expect(pointEvents(discarded.events)).toEqual([]);

    const nothing = board({ hand: [discardOrPoints.id], score: 2 });
    expect(plays(nothing.state)).toEqual([]);

    const rich = board({ hand: [discardOrPoints.id, v.vanilla1.id], score: 3 });
    const pointsPaid = run(rich.state, "player", play(rich.ids.player.hand[0]), [1]);
    expect((pointsPaid.prompts[0] as ChooseModePrompt).options).toEqual([{ mode: 0, legal: true }, { mode: 1, legal: true }]);
    expect(pointsPaid.state.sides.player.score).toBe(0);
    expect(pointsPaid.state.sides.player.hand).toEqual([rich.ids.player.hand[1]]);
  });

  it("asks about an optional ⍟ cost only when the side has them all, and records whether it was paid", () => {
    const short = board({ hand: [optionalPoints.id], score: 1 });
    const unasked = run(short.state, "player", play(short.ids.player.hand[0]));
    expect(unasked.prompts).toEqual([]);
    expect(unasked.state.stack[0]?.optionalPaid).toEqual([false]);
    expect(unasked.state.sides.player.score).toBe(1);

    for (const pays of [true, false]) {
      const { state, ids } = board({ hand: [optionalPoints.id], score: 2 });
      const answered = run(state, "player", play(ids.player.hand[0]), [pays]);
      expect(answered.prompts.map((prompt) => prompt.purpose.role)).toEqual(["optionalCost"]);
      expect(answered.state.stack[0]?.optionalPaid).toEqual([pays]);
      expect(answered.state.sides.player.score).toBe(pays ? 0 : 2);
    }

    // An alternative's ⍟ leave too few for the optional ⍟, which is then not offered.
    const shared = board({ hand: [twoPointCosts.id, v.vanilla1.id], score: 4 });
    const both = run(shared.state, "player", play(shared.ids.player.hand[0]), [1]);
    expect(both.prompts.map((prompt) => prompt.purpose.role)).toEqual(["chooseCost"]);
    expect(both.state.stack[0]?.optionalPaid).toEqual([false]);
    expect(both.state.sides.player.score).toBe(1);
  });
});

describe("pointsCost across suspension and failure", () => {
  it("reloads the optional payment unchanged, commits nothing until answered, and refuses stale, foreign and concurrent input", () => {
    const { state, ids } = board({ hand: [optionalPoints.id], score: 2 });
    const action = play(ids.player.hand[0]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(stateHash(opened.committed)).toBe(stateHash(state));

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: Answer, slice: BattleSlice = saved) => cold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value });

    expect(answer("enemy", true)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(answer("player", 2)).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
    expect(answer("player", true, reopened)).toEqual({ kind: "bounced", reason: "stalePrompt" });

    const paid = applied(answer("player", true));
    expect(paid.inFlight).toBeNull();
    // The ⍟, the energy and the play commit together.
    expect(paid.committed.sides.player.score).toBe(0);
    expect(paid.committed.sides.player.currentEnergy).toBe(2);
    expect(paid.committed.stack[0]).toMatchObject({ instance: ids.player.hand[0], optionalPaid: [true] });
    expect(answer("player", true, paid)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("bounces a play offered before the side's ⍟ dropped below the cost", () => {
    const rich = board({ hand: [pricedCharacter.id], score: 4 });
    const action = play(rich.ids.player.hand[0]);
    expect(plays(rich.state)).toEqual([rich.ids.player.hand[0]]);
    const poorer: BattleState = { ...rich.state, sides: { ...rich.state.sides, player: { ...rich.state.sides.player, score: 3 } } };
    const fold = createFoldAdapter(engine);
    expect(fold.reduce(sliceOf(poorer), { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "illegalAction" });
    expect(() => engine.apply(poorer, "player", action, new ScriptedSource([]))).toThrow();
  });

  it("commits neither the ⍟ nor the play when rules code fails after paying", () => {
    const { state, ids } = board({ hand: [failsAfterPaying.id], score: 4 });
    const before = stateHash(state);
    const observed: EngineEvent[] = [];
    expect(() => runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]), engine.catalog, { observeEvent: (event) => observed.push(event) })).toThrow("synthetic failure after the payment");
    expect(pointEvents(observed)).toEqual([{ kind: "pointsScored", side: "player", amount: -4, cause: "effect" }]);
    expect(stateHash(state)).toBe(before);
    expect(state.sides.player.score).toBe(4);
  });

  it("refuses to pay more ⍟ than the payer has rather than stopping at 0", () => {
    const { state, ids } = board({ hand: [overpays.id], score: 4 });
    expect(() => runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]), engine.catalog)).toThrow(/cannot pay 5⍟/);
    expect(state.sides.player.score).toBe(4);
  });
});
