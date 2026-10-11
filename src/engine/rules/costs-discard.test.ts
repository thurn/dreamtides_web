/**
 * Filtered and variable discard costs: payment values, the final discard
 * choice, proof modes and replay divergence, and payable resources across
 * nested costs.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { discardCostFilter, energy } from "../dsl/builders";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { isLegalAnswer, legalAnswers } from "../prompts/answers";
import type { ChooseCardsPrompt } from "../prompts/types";
import { stateHash } from "../state/hash";
import type { BattleState } from "../state/types";
import { ReplayDivergence } from "../steps/errors";
import type { SearchMemo } from "../steps/feasibility";
import type { Step } from "../steps/kinds";
import { runStep } from "../steps/runner";
import { INTERACTIVE, ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { Action } from "./actions";
import { payCosts, planCosts } from "./costs";
import {
  fixture,
  SEARCH,
  engine,
  v,
  deck,
  board,
  run,
  playFirst,
  resolve,
  plays,
  activations,
  sliceOf,
  appliedSlice,
} from "./costs.fixtures";

describe("filtered discard payment values", () => {
  it("filters current characteristics, captures copiable cost before payment, and discovers exactly that cost or one higher", () => {
    for (const higher of [false, true]) {
      const setup = board({ back: [higher ? SEARCH.exhaustedDiscover.id : SEARCH.filteredDiscover.id], hand: [{ cardId: v.event1.id, deckMods: { sparkBonus: 0, costReduction: 1, fast: false, reclaim: null, typeChange: { cardType: "character", subtype: "Warrior" } } }, v.vanilla2.id, v.vanilla2.id, v.event0.id], energy: 1, deck: [SEARCH.mage.id, v.vanilla1.id, v.vanilla2.id] });
      const { state, ids } = setup;
      const source = ids.player.back[0]!;
      const fold = createFoldAdapter(engine);
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } }));
      const prompt = fold.pending(opened)!.prompt as ChooseCardsPrompt;
      expect(prompt.candidates).toEqual(ids.player.hand.slice(0, 3));
      expect(prompt.candidates[1]).not.toBe(prompt.candidates[2]);
      const paid = run(state, "player", { kind: "activate", source, ability: 0 }, [[ids.player.hand[0]]]);
      expect(paid.state.stack[0]?.x).toBe(0);
      expect(paid.state.sides.player.currentEnergy).toBe(higher ? 1 : 0);
      expect(paid.state.instances[source].status.exhausted).toBe(higher);
      expect(paid.events).toContainEqual({ kind: "discarded", side: "player", instance: ids.player.hand[0] });
      const saved = JSON.parse(JSON.stringify(paid.state)) as BattleState;
      saved.instances[ids.player.hand[0]] = { ...saved.instances[ids.player.hand[0]], variant: { amplified: false } };
      const result = resolve(saved);
      expect(result.state.sides.player.hand).toContain(higher ? ids.player.deck[1] : ids.player.deck[0]);
      expect(result.state.sides.player.hand).not.toContain(ids.player.deck[2]);
    }
  });

  it("allows zero through the remaining hand count without charging energy for X, in both variants", () => {
    for (const amplified of [false, true]) for (const count of [0, 1, 2]) {
      const { state, ids } = board({ hand: [{ cardId: SEARCH.variableDiscard.id, amplified }, v.vanilla1.id, v.vanilla1.id], energy: 1, deck: [v.vanilla2.id, v.vanilla2.id, v.vanilla2.id, v.vanilla2.id] });
      const paid = playFirst(state, ids.player.hand[0], [ids.player.hand.slice(1, count + 1)]);
      expect(paid.state.stack[0]?.x).toBe(count);
      expect(paid.state.sides.player.currentEnergy).toBe(0);
      expect(new Set(paid.state.sides.player.void)).toEqual(new Set(ids.player.hand.slice(1, count + 1)));
      const done = resolve(JSON.parse(JSON.stringify(paid.state)) as BattleState);
      expect(done.state.sides.player.hand).toHaveLength(2 - count + count + (amplified ? 2 : 1));
      const alone = board({ hand: [SEARCH.variableDiscard.id], energy: 1 });
      expect(playFirst(alone.state, alone.ids.player.hand[0]).state.stack[0]?.x).toBe(0);
    }
  });

  it("keeps filtered costs distinct and excludes targets, the played source, and cards outside the hand", () => {
    const short = board({ hand: [SEARCH.filteredCosts.id, v.vanilla1.id], back: [v.vanilla1.id], void: [v.vanilla1.id] });
    expect(plays(short.state)).not.toContain(short.ids.player.hand[0]);
    const enough = board({ hand: [SEARCH.filteredCosts.id, SEARCH.mage.id, v.vanilla1.id] });
    const paid = playFirst(enough.state, enough.ids.player.hand[0]);
    expect(new Set(paid.state.sides.player.void)).toEqual(new Set(enough.ids.player.hand.slice(1)));
    const foeOnly = board({ back: [SEARCH.filteredDiscover.id], hand: [v.event1.id], energy: 1 });
    expect(activations(foeOnly.state)).toEqual([]);
    const targeted = board({ hand: [SEARCH.discardAndTarget.id, v.vanilla1.id], back: [v.vanilla1.id] });
    const result = playFirst(targeted.state, targeted.ids.player.hand[0]);
    const item = result.state.stack[0];
    if (item.kind !== "card") throw new Error("expected a card stack item");
    expect(item.choices[0].targets).toEqual([[targeted.ids.player.back[0]]]);
    expect(result.state.sides.player.void).toEqual([targeted.ids.player.hand[1]]);
  });

  it("uses one consistent X binding when an energy-X cost is present", () => {
    const variable = board({ hand: [SEARCH.combinedX.id, v.vanilla1.id, v.vanilla1.id], energy: 2 });
    const paid = playFirst(variable.state, variable.ids.player.hand[0], [1, [variable.ids.player.hand[1]]]);
    expect(paid.state.stack[0]?.x).toBe(1);
    expect(paid.state.sides.player.currentEnergy).toBe(1);
    expect(resolve(paid.state).state.sides.player.score).toBe(1);
    const captured = board({ hand: [SEARCH.competingX.id, v.vanilla2.id], energy: 3 });
    const fold = createFoldAdapter(engine);
    const opened = appliedSlice(fold.reduce(sliceOf(captured.state), { kind: "battleAction", side: "player", action: { kind: "play", card: captured.ids.player.hand[0], from: "hand" } }));
    // Only X=2 can pay the selected card's captured cost; this sole legal answer auto-commits.
    expect(opened.committed.stack[0]?.x).toBe(2);
    expect(opened.committed.sides.player.currentEnergy).toBe(1);
  });

  it("uses a captured X for subsequent variable costs and optional-cost affordability", () => {
    for (const enough of [false, true]) {
      const { state, ids } = board({ hand: [SEARCH.capturedThenVariable.id, v.vanilla2.id, v.vanilla2.id, ...(enough ? [v.vanilla2.id] : [])] });
      const result = playFirst(state, ids.player.hand[0], [[ids.player.hand[1]], ...(enough ? [true] : [])]);
      expect(result.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [enough] });
      expect(result.state.sides.player.void).toHaveLength(enough ? 3 : 1);
      expect(result.answers.filter((answer) => typeof answer.value === "boolean")).toHaveLength(enough ? 1 : 0);
    }
  });

  it("keeps filtered and variable prompts stable through reload and rejects stale, foreign, concurrent, repeated, and out-of-range input", () => {
    for (const variable of [false, true]) {
      const { state, ids } = board({ back: [SEARCH.filteredDiscover.id], hand: [SEARCH.variableDiscard.id, v.vanilla1.id, v.vanilla1.id, v.event1.id], energy: 1 });
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      const action: Action = variable ? { kind: "play", card: ids.player.hand[0], from: "hand" } : { kind: "activate", source: ids.player.back[0]!, ability: 0 };
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
      const pending = fold.pending(opened)!;
      const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
      expect(createFoldAdapter(engine).pending(saved)).toEqual(pending);
      expect(stateHash(opened.committed)).toBe(stateHash(state));
      expect(fold.reduce(opened, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      for (const side of ["enemy", "player"] as const) {
        expect(fold.reduce(opened, { kind: "answer", side, promptId: pending.prompt.id, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: side === "enemy" ? "notYourPrompt" : "illegalAnswer" });
      }
      expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1], ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      if (!variable) expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[3]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: ids.player.hand })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.reduce(opened, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      const cancelled = appliedSlice(fold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
      expect(cancelled.committed).toEqual(state);
      expect(cancelled.inFlight).toBeNull();
      expect(fold.reduce(cancelled, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      const reopened = appliedSlice(fold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
      expect(fold.pending(reopened)!.prompt.id).not.toBe(pending.prompt.id);
      expect(fold.reduce(reopened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const answered = appliedSlice(fold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] }));
      expect(answered.committed.instances[ids.player.hand[1]].zone).toBe("void");
      expect(fold.reduce(answered, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    }
  });

  it("rolls back payment state when rules code fails after paying", () => {
    const failing: EngineCardDefinition = {
      ...SEARCH.variableDiscard, id: syntheticId(0xf30),
      synthetic: { play(ctx, source) {
        const plan = planCosts(ctx, "player", source, [energy(1), discardCostFilter({ cardType: "character" }, { captureCost: true })], null, (role) => ({ source, cardId: syntheticId(0xf30), ability: 0, role }), [source]);
        ctx.commitPoint();
        payCosts(ctx, "player", source, plan);
        throw new Error("synthetic failure after payment");
      } },
    };
    const catalog = testCatalog([failing]);
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [failing.id, v.vanilla2.id], energy: 1 } });
    const before = stateHash(state);
    const observed: EngineEvent[] = [];
    expect(() => runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]), catalog, { observeEvent: (event) => observed.push(event) })).toThrow("synthetic failure after payment");
    expect(observed).toContainEqual({ kind: "discarded", side: "player", instance: ids.player.hand[1] });
    expect(observed).toContainEqual(expect.objectContaining({ kind: "energyChanged", side: "player", current: 0, max: 1 }));
    expect(stateHash(state)).toBe(before);
  });
});

describe("final discard choice coverage", () => {
  it.each([[9, 1], [9, 256], [10, 1], [10, 256]])("keeps every subset answerable with %i hand cards and a synthetic budget of %i", (size, budget) => {
    for (const reversed of [false, true]) {
      const setup = board({ hand: [SEARCH.variableDiscard.id, ...Array.from({ length: size }, () => v.vanilla1.id)], energy: 1 });
      const state = { ...setup.state, config: { ...setup.state.config, feasibilitySearchRuns: budget } };
      if (reversed) state.sides.player.hand.reverse();
      const card = setup.ids.player.hand[0];
      const fold = createFoldAdapter(engine);
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
      const pending = fold.pending(opened)!;
      const prompt = pending.prompt as ChooseCardsPrompt;
      const raw = { ...prompt, max: size, allowed: undefined };
      for (const selection of legalAnswers(raw)) {
        expect(isLegalAnswer(prompt, selection)).toBe(true);
      }
      for (let count = 0; count <= size; count++) {
        const cards = [...setup.ids.player.hand.slice(1)].reverse().slice(0, count);
        const paid = appliedSlice(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: cards }));
        expect(paid.committed.stack[0]?.x).toBe(count);
        expect(paid.committed.sides.player.currentEnergy).toBe(0);
        expect(new Set(paid.committed.sides.player.void)).toEqual(new Set(cards));
        expect(new Set(paid.committed.sides.player.hand)).toEqual(new Set(setup.ids.player.hand.slice(1).filter(id => !cards.includes(id))));
      }
    }
  });
});

/** A fresh, deliberately switchable play hook for replay diagnostics through the execution API. */
function proofReplayFixture() {
  const behavior = { filtered: false, final: true };
  const definition: EngineCardDefinition = {
    ...fixture(35, "event", () => []),
    synthetic: { play(ctx, source) {
      planCosts(ctx, "player", source, [discardCostFilter(behavior.filtered ? { cardType: "character" } : {})], null,
        role => ({ source, cardId: syntheticId(0xf23), ability: 0, role }), [source], undefined,
        behavior.final ? { endsPlayTime: true } : {});
      return {};
    } },
  };
  const replayEngine = createEngine(testCatalog([definition]));
  const { state, ids } = boardState(replayEngine.catalog, {
    active: "player", phase: "day",
    player: { hand: [definition.id, v.vanilla1.id, v.vanilla2.id, v.event1.id], deck }, enemy: { deck },
  });
  const step: Step = { kind: "play", card: ids.player.hand[0], from: "hand" };
  return { behavior, replayEngine, state, ids, step };
}

it("reports replay divergence when a cached prompt changes fingerprint and proof mode", () => {
  const { behavior, replayEngine, state, step } = proofReplayFixture();
  const searches: SearchMemo = new WeakMap();
  const before = stateHash(state);
  const opened = runStep(state, step, INTERACTIVE, replayEngine.catalog, { searches });
  expect(opened.kind).toBe("suspended");
  behavior.filtered = true;
  behavior.final = false;
  expect(() => runStep(state, step, INTERACTIVE, replayEngine.catalog, { searches })).toThrow(ReplayDivergence);
  expect(stateHash(state)).toBe(before);
});

it("rejects a changed proof mode for the same cached prompt without replay divergence", () => {
  const { behavior, replayEngine, state, step } = proofReplayFixture();
  const searches: SearchMemo = new WeakMap();
  const before = stateHash(state);
  expect(runStep(state, step, INTERACTIVE, replayEngine.catalog, { searches }).kind).toBe("suspended");
  behavior.final = false;
  let failure: unknown;
  try {
    runStep(state, step, INTERACTIVE, replayEngine.catalog, { searches });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(ReplayDivergence);
  expect(stateHash(state)).toBe(before);
});

it("retains committed state and clears a failed fold attempt after prompt and proof divergence", () => {
  const { behavior, replayEngine, state, ids, step } = proofReplayFixture();
  const fold = createFoldAdapter(replayEngine);
  const before = stateHash(state);
  const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: step }));
  const pending = fold.pending(opened)!;
  behavior.filtered = true;
  behavior.final = false;
  const outcome = fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] });
  if (outcome.kind !== "applied") throw new Error("expected a failed attempted play");
  expect(outcome.error).not.toBeNull();
  expect(stateHash(outcome.slice.committed)).toBe(before);
  expect(outcome.slice.inFlight).toBeNull();
  expect(fold.pending(outcome.slice)).toBeNull();
});

it("guards a nonterminal repeated cost object and manual plans with later constraints", () => {
  const repeated = board({ hand: [SEARCH.repeatedDiscard.id, v.vanilla1.id, v.vanilla1.id] });
  const fold = createFoldAdapter(engine);
  const opened = appliedSlice(fold.reduce(sliceOf(repeated.state), { kind: "battleAction", side: "player", action: { kind: "play", card: repeated.ids.player.hand[0], from: "hand" } }));
  const prompt = fold.pending(opened)!.prompt;
  expect(isLegalAnswer(prompt, repeated.ids.player.hand.slice(1))).toBe(false);
  const paid = playFirst(repeated.state, repeated.ids.player.hand[0], [[repeated.ids.player.hand[1]]]);
  expect(paid.state.stack[0]?.x).toBe(1);
  expect(new Set(paid.state.sides.player.void)).toEqual(new Set(repeated.ids.player.hand.slice(1)));
  const manual = board({ hand: [SEARCH.guardedManualCost.id, v.vanilla1.id, v.vanilla1.id] });
  expect(playFirst(manual.state, manual.ids.player.hand[0]).answers[0].value).toEqual(manual.ids.player.hand.slice(1));
});

it("rejects an unexpected precommit prompt after a universal proof without committing state", () => {
  const { state, ids } = board({ hand: [SEARCH.invalidFinalProof.id, v.vanilla1.id, v.vanilla1.id] });
  const fold = createFoldAdapter(engine);
  const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  const prompt = fold.pending(opened)!.prompt;
  const outcome = fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.id, value: [] });
  if (outcome.kind !== "applied") throw new Error("expected a failed attempted play");
  expect(outcome.error).not.toBeNull();
  expect(stateHash(outcome.slice.committed)).toBe(stateHash(state));
  expect(outcome.slice.inFlight).toBeNull();
  expect(fold.pending(outcome.slice)).toBeNull();
});

it("preserves full final-discard choices and payment after a cold fold reload", () => {
  const { state, ids } = board({ hand: [SEARCH.variableDiscard.id, v.vanilla1.id, v.vanilla1.id], energy: 1 });
  const fold = createFoldAdapter(engine);
  const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  const pending = fold.pending(opened)!;
  const cold = createFoldAdapter(createEngine(engine.catalog));
  const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
  expect(cold.pending(saved)).toEqual(pending);
  for (const value of legalAnswers(pending.prompt)) {
    const input = { kind: "answer", side: "player", promptId: pending.prompt.id, value } as const;
    expect(cold.reduce(saved, input)).toEqual(fold.reduce(opened, input));
  }
});

it("offers terminal discard only with payable resources and reserves exhaustion across nested costs", () => {
  for (const blocked of ["energy", "counters", "exhaustion", null]) {
    const { state, ids } = board({ back: [SEARCH.resourceDiscard.id], hand: [v.vanilla1.id, v.vanilla1.id], energy: blocked === "energy" ? 0 : 1 });
    const source = ids.player.back[0]!;
    state.instances[source].status.counters = blocked === "counters" ? 0 : 1;
    state.instances[source].status.exhausted = blocked === "exhaustion";
    const action = { kind: "activate", source, ability: 0 } as const;
    expect(activations(state)).toEqual(blocked === null ? [action] : []);
    if (blocked === null) {
      const paid = run(state, "player", action, [ids.player.hand]);
      expect(paid.state.stack[0]?.x).toBe(2);
      expect(paid.state.instances[source].status).toMatchObject({ counters: 0, exhausted: true });
      expect(paid.state.sides.player.currentEnergy).toBe(0);
      expect(new Set(paid.state.sides.player.void)).toEqual(new Set(ids.player.hand));
    } else {
      const fold = createFoldAdapter(engine);
      const before = stateHash(state);
      const slice = sliceOf(state);
      expect(fold.reduce(slice, { kind: "battleAction", side: "player", action })).toMatchObject({ kind: "bounced" });
      expect(stateHash(slice.committed)).toBe(before);
      expect(slice.inFlight).toBeNull();
    }
  }
  const twice = board({ back: [SEARCH.duplicateExhaustDiscard.id], hand: [v.vanilla1.id] });
  expect(activations(twice.state)).toEqual([]);
  const nested = board({ back: [SEARCH.nestedExhaustDiscard.id], hand: [v.vanilla1.id, v.vanilla1.id] });
  const action = { kind: "activate", source: nested.ids.player.back[0]!, ability: 0 } as const;
  const paid = run(nested.state, "player", action, [nested.ids.player.hand]);
  expect(paid.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [false] });
  expect(paid.state.instances[action.source].status.exhausted).toBe(true);
});
