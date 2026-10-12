/**
 * A variable discard's least X (`discardCostFilter(filter, { count: "x", min })`),
 * on Embrace the Infinite ("Gain X⍟. / Reclaim – Discard X cards.",
 * RD-hv-umm2.457-1) and synthetic cards: from hand it costs X● with X at
 * least 1; by Reclaim the discarded count is X, from the least X up to the
 * whole hand, and drives the points; fewer hand cards than the least X make
 * the route unplayable; the choice survives reload, refuses stale and
 * invalid input, commits with the play or not at all, and the item waits on
 * the stack for the opponent's response. A discard X without `min` keeps
 * admitting zero.
 */
import { describe, expect, it } from "vitest";
import embraceTheInfinite from "../../content/cards/embrace-the-infinite-79b37916";
import type { EngineCardDefinition } from "../catalog";
import { engineCardFromContent } from "../content-catalog";
import { additionalCost, choiceCost, optionalCost, pointsCost, discardCostFilter, discardHandCost, energy, energyX, event, x } from "../dsl/builders";
import type { PaymentCost } from "../dsl/types";
import { gainPoints } from "../effects/primitives/gain-points";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../fold/slice";
import { isLegalAnswer } from "../prompts/answers";
import type { Answer, ChooseCardsPrompt, ChooseNumberPrompt, Prompt } from "../prompts/types";
import { stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { ScriptedSource } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { boardState, type SideSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { Action } from "./actions";
import { payCosts, planCosts } from "./costs";

const synthetic = (index: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "standard", status: "authored", abilities, ...extra,
});

const embrace = engineCardFromContent(embraceTheInfinite);
/** "To play this event, discard X cards. Gain X⍟.": the zero-admitting form. */
const discardAny = synthetic(4570, () => [additionalCost(discardCostFilter({}, { count: "x" })), event(gainPoints(x()))]);
/** "To play this event, discard X cards, at least two. Gain X⍟." */
const discardTwoOrMore = synthetic(4571, () => [additionalCost(discardCostFilter({}, { count: "x", min: 2 })), event(gainPoints(x()))]);
/** "X●. To play this event, discard X cards (at least one). Gain X⍟." through one shared X that may be 0●. */
const pricedDiscard = synthetic(4572, () => [additionalCost(discardCostFilter({}, { count: "x", min: 1 })), event(gainPoints(x()))], { costs: [energyX(0)] });
const discardCost = discardCostFilter({}, { count: "x", min: 1 });
/** Pays a least-1 discard-X plan after the commit point, then its rules code fails when X is 1; a larger X plays on. */
const failsAfterPaying = synthetic(4573, () => [], {
  synthetic: {
    play(ctx, source) {
      const plan = planCosts(ctx, "player", source, [discardCost], null, (role) => ({ source, cardId: syntheticId(4573), ability: 0, role }), [source]);
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      if (plan.x === 1) throw new Error("synthetic failure after the discard");
      return {};
    },
  },
});

const engine = createEngine(testCatalog([embrace, discardAny, discardTwoOrMore, pricedDiscard, failsAfterPaying]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

/** The enemy holds an Interrupt, so the played item waits on the stack until the enemy passes. */
const board = (player: SideSetup) =>
  boardState(engine.catalog, { active: "player", phase: "day", player: { deck, energy: 3, ...player }, enemy: { deck, hand: [v.interruptEvent.id], energy: 5 } });

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
const play = (card: InstanceId, from: "hand" | "void" = "hand"): Action => ({ kind: "play", card, from });
const resolve = (state: BattleState) => run(state, "enemy", { kind: "pass" });
/** The player's legal plays of the subject card instance `card`. */
const plays = (state: BattleState, card: InstanceId) =>
  engine.legalActions(state, "player").flatMap((action) => (action.kind === "play" && action.card === card ? [action.from] : []));
const sorted = (ids: readonly InstanceId[]) => [...ids].sort();
const discardedBy = (events: readonly EngineEvent[]) => events.flatMap((event) => (event.kind === "discarded" ? [event.instance] : []));
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

describe("Embrace the Infinite", () => {
  it("is played from hand for X● with X at least 1, discarding nothing, and gains X⍟", () => {
    const { state, ids } = board({ hand: [embrace.id, v.vanilla1.id] });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const chooseX = fold.pending(opened)!.prompt as ChooseNumberPrompt;
    expect(chooseX).toMatchObject({ kind: "chooseNumber", min: 1, max: 3 });
    expect(chooseX.purpose.role).toBe("chooseX");
    expect(isLegalAnswer(chooseX, 0)).toBe(false);

    const paid = run(state, "player", play(ids.player.hand[0]), [2]);
    expect(paid.prompts.map((prompt) => prompt.purpose.role)).toEqual(["chooseX"]);
    expect(paid.state.stack[0]).toMatchObject({ instance: ids.player.hand[0], x: 2 });
    expect(paid.state.sides.player.currentEnergy).toBe(1);
    expect(paid.state.sides.player.hand).toEqual([ids.player.hand[1]]);
    const resolved = resolve(paid.state).state;
    expect(resolved.sides.player.score).toBe(2);
    expect(resolved.instances[ids.player.hand[0]].zone).toBe("void");
  });

  it("is reclaimed by discarding X hand cards, from 1 up to the whole hand, spending no energy, gaining X⍟ and banishing itself", () => {
    for (const count of [1, 2, 3]) {
      const { state, ids } = board({ void: [embrace.id], hand: [v.vanilla1.id, v.event0.id, v.vanilla2.id], energy: 0 });
      const self = ids.player.void[0];
      expect(plays(state, self)).toEqual(["void"]);
      const chosen = ids.player.hand.slice(0, count);
      const paid = run(state, "player", play(self, "void"), [chosen]);
      expect(paid.prompts.map((prompt) => prompt.purpose.role)).toEqual(["discardCost"]);
      expect(paid.prompts[0]).toMatchObject({ kind: "chooseCards", min: 1, max: 3 });
      expect([...(paid.prompts[0] as ChooseCardsPrompt).candidates].sort()).toEqual([...ids.player.hand].sort());
      expect(paid.state.stack[0]).toMatchObject({ instance: self, x: count });
      expect(paid.state.sides.player.currentEnergy).toBe(0);
      expect(paid.state.sides.player.hand).toEqual(ids.player.hand.slice(count));
      expect(discardedBy(paid.events)).toEqual(chosen);
      const resolved = resolve(paid.state).state;
      expect(resolved.sides.player.score).toBe(count);
      expect(resolved.instances[self].zone).toBe("banished");
      for (const id of chosen) expect(resolved.instances[id].zone).toBe("void");
    }
  });

  it("cannot be reclaimed with an empty hand, and offers no X of 0 by Reclaim", () => {
    const empty = board({ void: [embrace.id], energy: 3 });
    expect(plays(empty.state, empty.ids.player.void[0])).toEqual([]);

    const { state, ids } = board({ void: [embrace.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.void[0], "void") }));
    const prompt = fold.pending(opened)!.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ min: 1, max: 2, candidates: ids.player.hand });
    expect(isLegalAnswer(prompt, [])).toBe(false);
  });
});

describe("discard X with a least X", () => {
  it("is unplayable with fewer matching hand cards than the least X, and asks for the least X up to the whole hand", () => {
    const short = board({ hand: [discardTwoOrMore.id, v.vanilla1.id] });
    expect(plays(short.state, short.ids.player.hand[0])).toEqual([]);

    const { state, ids } = board({ hand: [discardTwoOrMore.id, v.vanilla1.id, v.vanilla2.id, v.event0.id] });
    expect(plays(state, ids.player.hand[0])).toEqual(["hand"]);
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const prompt = fold.pending(opened)!.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ kind: "chooseCards", min: 2, max: 3, candidates: ids.player.hand.slice(1) });
    expect(isLegalAnswer(prompt, [ids.player.hand[1]])).toBe(false);
    const paid = run(state, "player", play(ids.player.hand[0]), [ids.player.hand.slice(1, 3)]);
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(resolve(paid.state).state.sides.player.score).toBe(2);
  });

  it("shares X with an energy X: an X● below the least X is withheld", () => {
    const { state, ids } = board({ hand: [pricedDiscard.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], energy: 3 });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const pendingX = fold.pending(opened)!;
    expect(isLegalAnswer(pendingX.prompt as ChooseNumberPrompt, 0)).toBe(false);
    const answered = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: pendingX.prompt.id, value: 2 }));
    expect(fold.pending(answered)!.prompt).toMatchObject({ kind: "chooseCards", min: 2, max: 2, candidates: ids.player.hand.slice(1) });
  });

  it("keeps the zero-admitting, whole-hand and captured-cost forms unchanged", () => {
    const { state, ids } = board({ hand: [discardAny.id, v.vanilla1.id] });
    const zero = run(state, "player", play(ids.player.hand[0]), [[]]);
    expect(zero.prompts[0]).toMatchObject({ kind: "chooseCards", min: 0, max: 1 });
    expect(zero.state.stack[0]?.x).toBe(0);

    expect(discardCostFilter({}, { count: "x" })).toEqual({ cost: "discard", count: "x", filter: {} });
    expect(discardCostFilter({}, { count: "x", min: 1 })).toEqual({ cost: "discard", count: "x", filter: {}, min: 1 });
    expect(discardCostFilter({ cardType: "event" }, { captureCost: true })).toEqual({ cost: "discard", count: 1, filter: { cardType: "event" }, captureCost: true });
    expect(discardCostFilter({}, { count: 2 })).toEqual({ cost: "discard", count: 2, filter: {} });
    expect(discardHandCost()).toEqual({ cost: "discard", count: "hand" });
    expect(() => discardCostFilter({}, { count: "x", min: -1 })).toThrow();
    const malformed: readonly PaymentCost[] = [
      // @ts-expect-error a fixed count has no least X.
      { cost: "discard", count: 2, filter: {}, min: 1 },
      // @ts-expect-error a whole-hand discard has no least X.
      { cost: "discard", count: "hand", min: 1 },
    ];
    expect(malformed).toHaveLength(2);
  });
});

describe("nested discard-X minimum affordability", () => {
  for (const side of ["player", "enemy"] as const) {
    it.each(["choice", "optional"] as const)(`keeps the valid %s fallback when ${side}'s matching hand is below minimum`, (kind) => {
      const cost = discardCostFilter({ cardType: "character" }, { count: "x", min: 2 });
      const card = synthetic(46901, () => [additionalCost(kind === "choice" ? choiceCost([cost], [pointsCost(1)]) : optionalCost(cost)), event(gainPoints(1))]);
      const current = createEngine(testCatalog([card]));
      const { state, ids } = boardState(current.catalog, { active: side, phase: "day", [side]: {
        hand: [card.id, v.vanilla1.id, v.event0.id], score: 3, energy: 1,
      } });
      const prepared = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
      const prompts: Prompt[] = [];
      const paid = current.apply(prepared, side, play(ids[side].hand[0]), {
        answer(prompt) {
          prompts.push(prompt);
          if (prompt.kind === "chooseMode") {
            expect(prompt.options.find((option) => option.mode === 0)?.legal).toBe(false);
            expect(prompt.options.find((option) => option.mode === 1)?.legal).toBe(true);
            return 1;
          }
          if (prompt.kind === "confirm") return false;
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(prompts.some((prompt) => prompt.purpose.role === "optionalCost")).toBe(false);
      expect(discardedBy(paid.events)).toEqual([]);
      expect(paid.state.sides[side].hand).toEqual(ids[side].hand.slice(1));
      expect(paid.state.sides[side].score).toBe(kind === "choice" ? 3 : 4);
      expect(invariantViolations(paid.state, current.catalog)).toEqual([]);
    });

    it.each([
      { kind: "choice", bound: 1, accept: true, discarded: 0 },
      { kind: "optional", bound: 1, accept: true, discarded: 0 },
      { kind: "choice", bound: 2, accept: true, discarded: 2 },
      { kind: "optional", bound: 2, accept: true, discarded: 2 },
      { kind: "optional", bound: 2, accept: false, discarded: 0 },
    ] as const)(`checks $kind at shared X=$bound as ${side}, accept=$accept`, ({ kind, bound, accept, discarded }) => {
      const cost = discardCostFilter({ cardType: "character" }, { count: "x", min: 2 });
      const card = synthetic(46902, () => [additionalCost(kind === "choice" ? choiceCost([cost], [pointsCost(1)]) : optionalCost(cost)), event(gainPoints(x()))], { costs: [energyX(0)] });
      const current = createEngine(testCatalog([card]));
      const { state, ids } = boardState(current.catalog, { active: side, phase: "day", [side]: {
        hand: [card.id, v.vanilla1.id, v.vanilla2.id, v.event0.id], score: 3, energy: 3,
      } });
      const prepared = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
      const prompts: Prompt[] = [];
      const paid = current.apply(prepared, side, play(ids[side].hand[0]), {
        answer(prompt) {
          prompts.push(prompt);
          if (prompt.purpose.role === "chooseX") return bound;
          if (prompt.kind === "chooseMode") {
            expect(prompt.options.find((option) => option.mode === 0)?.legal).toBe(bound >= 2);
            return bound >= 2 ? 0 : 1;
          }
          if (prompt.kind === "confirm") return accept;
          if (prompt.kind === "chooseCards") {
            expect(prompt).toMatchObject({ min: 2, max: 2 });
            expect(sorted(prompt.candidates)).toEqual(sorted(ids[side].hand.slice(1, 3)));
            return ids[side].hand.slice(1, 3);
          }
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(prompts.some((prompt) => prompt.purpose.role === "optionalCost")).toBe(kind === "optional" && bound >= 2);
      expect(discardedBy(paid.events)).toEqual(ids[side].hand.slice(1, 1 + discarded));
      for (const id of ids[side].hand.slice(1, 1 + discarded)) expect(paid.state.instances[id].zone).toBe("void");
      expect(paid.state.sides[side].currentEnergy).toBe(3 - bound);
      expect(paid.state.sides[side].score).toBe(3 + bound - (kind === "choice" && bound < 2 ? 1 : 0));
      expect(invariantViolations(paid.state, current.catalog)).toEqual([]);
    });
  }
});

describe("Embrace the Infinite's Reclaim across suspension, failure and response", () => {
  it("reloads the discard choice unchanged, commits nothing until answered, and refuses stale, foreign, concurrent and invalid input", () => {
    const { state, ids } = board({ void: [embrace.id, v.vanilla3.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const self = ids.player.void[0];
    const action = play(self, "void");
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt.purpose.role).toBe("discardCost");
    expect(stateHash(opened.committed)).toBe(stateHash(state));

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: Answer, slice: BattleSlice = saved) => cold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value });

    expect(answer("enemy", [ids.player.hand[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }).kind).toBe("bounced");
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    // Too few cards, the reclaimed card itself, another void card, and the same card twice.
    for (const invalid of [[], [self], [ids.player.void[1]], [ids.player.hand[0], ids.player.hand[0]]]) {
      expect(answer("player", invalid)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }

    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
    expect(answer("player", [ids.player.hand[0]], reopened)).toEqual({ kind: "bounced", reason: "stalePrompt" });

    const paid = applied(answer("player", ids.player.hand));
    expect(paid.inFlight).toBeNull();
    // The discard and X commit together with the play.
    expect(paid.committed.sides.player.hand).toEqual([]);
    expect(sorted(paid.committed.sides.player.void)).toEqual(sorted([ids.player.void[1], ...ids.player.hand]));
    expect(paid.committed.sides.player.currentEnergy).toBe(3);
    expect(paid.committed.stack[0]).toMatchObject({ instance: self, x: 2 });
    expect(answer("player", [ids.player.hand[0]], paid)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("commits neither the discard nor the play when rules code fails after paying, and a persisted retry pays and plays", () => {
    const { state, ids } = board({ hand: [failsAfterPaying.id, v.vanilla1.id, v.vanilla2.id] });
    const before = stateHash(state);
    const observed: EngineEvent[] = [];
    expect(() => runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ids.player.hand[1]]]), engine.catalog, { observeEvent: (event) => observed.push(event) })).toThrow("synthetic failure after the discard");
    expect(discardedBy(observed)).toEqual([ids.player.hand[1]]);
    expect(stateHash(state)).toBe(before);

    const action = play(ids.player.hand[0]);
    const opened = applied(createFoldAdapter(engine).reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const pending = cold.pending(saved)!;
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] } as const;
    const outcome = cold.reduce(saved, answer);
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after the discard/);
    expect(outcome.published).toEqual([]);
    expect(outcome.slice).toEqual({ committed: state, inFlight: null, publishedEvents: 0, attempt: saved.attempt });
    expect(outcome.slice.committed.sides.player.hand).toEqual(ids.player.hand);

    const retried = applied(cold.reduce(outcome.slice, { kind: "battleAction", side: "player", action }));
    const again = cold.pending(retried)!;
    expect(cold.reduce(retried, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const paid = cold.reduce(retried, { kind: "answer", side: "player", promptId: again.prompt.id, value: ids.player.hand.slice(1) });
    if (paid.kind !== "applied" || paid.error !== null) throw new Error(`expected the retry to apply, got ${JSON.stringify(paid)}`);
    expect(discardedBy(paid.published)).toEqual(ids.player.hand.slice(1));
    expect(paid.slice.committed.sides.player.hand).toEqual([]);
  });

  it("waits on the stack with its X while the opponent responds, then gains X⍟ and is banished", () => {
    const { state, ids } = board({ void: [embrace.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const self = ids.player.void[0];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(self, "void") }));
    const paid = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: fold.pending(opened)!.prompt.id, value: [ids.player.hand[0]] }));
    expect(paid.committed.stack).toHaveLength(1);
    expect(paid.committed.stack[0]).toMatchObject({ instance: self, controller: "player", x: 1 });
    expect(engine.decision(paid.committed)?.side).toBe("enemy");

    const response = play(ids.enemy.hand[0]);
    expect(engine.legalActions(paid.committed, "enemy")).toContainEqual(response);
    const first = fold.reduce(paid, { kind: "battleAction", side: "enemy", action: response });
    const outcomes = [first];
    let slice = applied(first);
    // Whoever holds priority passes until the stack is empty.
    for (let guard = 0; slice.committed.stack.length > 0 && guard < 6; guard++) {
      const side = engine.decision(slice.committed)!.side;
      const passed = fold.reduce(slice, { kind: "battleAction", side, action: { kind: "pass" } });
      outcomes.push(passed);
      slice = applied(passed);
    }
    const published = outcomes.flatMap((outcome) => (outcome.kind === "applied" ? outcome.published : []));
    // The response, played above the reclaimed item, resolves first.
    expect(published.flatMap((event) => (event.kind === "resolved" ? [event.instance] : []))).toEqual([ids.enemy.hand[0], self]);
    expect(slice.committed.stack).toEqual([]);
    expect(slice.committed.sides.player.score).toBe(1);
    expect(slice.committed.instances[self].zone).toBe("banished");
    expect(slice.committed.sides.player.hand).toEqual([ids.player.hand[1]]);
    expect(invariantViolations(slice.committed, engine.catalog)).toEqual([]);
  });
});
