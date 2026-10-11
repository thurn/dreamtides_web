/**
 * Mandatory cycles (rules § Infinite Loops), on synthetic fixtures: an exact
 * repeat, a late-entered repeat, a two-step repeat, the resolution cap, and
 * the choices that make a sequence not mandatory.
 */
import { describe, expect, it } from "vitest";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import { nextAutomaticStep } from "../steps/driver";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { CYCLE, LOOP } from "../testing/loop-cards";
import { toggleEcho, engine, deck, board, sourceOf, activate, repeat, ended } from "./loops.fixtures";

/** Plays the only card in the player's hand from `state`, answering prompts from `answers`. */
function playOnly(state: BattleState, hand: readonly InstanceId[], answers: AnswerSource = NO_PROMPTS) {
  const card = hand[0];
  if (card === undefined) throw new Error("no card");
  return engine.apply(state, "player", { kind: "play", card, from: "hand" }, answers);
}

describe("mandatory loops", () => {
  it("ends the battle in a draw when automatic steps repeat a state exactly", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.echo.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const result = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBeLessThan(result.state.config.resolutionCap);
    expect(engine.decision(result.state)).toBeNull();
  });

  it("detects a cycle that repeats a state only every second step", () => {
    const { state, ids } = board({ player: { hand: [toggleEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, resolutionCap: 200, mandatoryLoopCheckFrom: 1 };
    const result = playOnly({ ...state, config }, ids.player.hand);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBeLessThan(config.resolutionCap);
  });

  it("ends a cycle that never repeats a state in a draw at the resolution cap", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.growingEcho.id], energy: 1, deck }, enemy: { deck } });
    const capped: BattleState = { ...state, config: { ...state.config, resolutionCap: 40, mandatoryLoopCheckFrom: 1 } };
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const result = engine.apply(capped, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "draw", reason: "resolutionCap" });
    expect(result.state.automaticSteps).toBe(41);
  });

  it("does not end an optional loop in a draw when its iterations stop changing the battle", () => {
    const { state, ids } = board({ player: { back: [LOOP.drain.id], deck }, enemy: { energy: 2, deck } });
    const once = activate(state, sourceOf(ids.player));
    expect(once.state.sides.enemy.currentEnergy).toBe(1);
    const checked: BattleState = { ...once.state, config: { ...once.state.config, loopIterationCap: 40, mandatoryLoopCheckFrom: 1 } };
    const result = repeat(checked, "untilVictory");
    expect(result.state.sides.enemy.currentEnergy).toBe(0);
    expect(result.state.result).toBeNull();
    expect(ended(result.events)).toEqual({ iterations: 40, reason: "iterationCap" });
  });

  it("detects a repeat that begins late in a run, before the resolution cap", () => {
    // From 0● after the play, the run gains 1● per step until 8● at step 9,
    // then repeats one state; a power-of-two step count falls just before it.
    const { state, ids } = board({ player: { hand: [CYCLE.lateEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, resolutionCap: 16, mandatoryLoopCheckFrom: 1, mandatoryLoopWindow: 4 };
    const result = playOnly({ ...state, config }, ids.player.hand);
    expect(result.state.sides.player.currentEnergy).toBe(8);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBeLessThanOrEqual(config.resolutionCap);
  });

  it("does not end a loop in a draw while its player keeps choosing to continue it", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.optionalEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, mandatoryLoopCheckFrom: 1 };
    const answers = new ScriptedSource([...Array.from({ length: 20 }, () => true), false]);
    const result = playOnly({ ...state, config }, ids.player.hand, answers);
    answers.assertExhausted();
    expect(result.answers.filter((answer) => answer.auto !== true)).toHaveLength(21);
    expect(result.state.result).toBeNull();
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });

  it("does not count automatic steps in which a player made a choice toward the resolution cap", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.optionalGrowingEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...state.config, resolutionCap: 5, mandatoryLoopCheckFrom: 1 };
    const answers = new ScriptedSource([...Array.from({ length: 10 }, () => true), false]);
    const result = playOnly({ ...state, config }, ids.player.hand, answers);
    answers.assertExhausted();
    expect(result.state.sides.player.currentEnergy).toBe(10);
    expect(result.state.result).toBeNull();
    expect(result.state.automaticSteps).toBeLessThanOrEqual(config.resolutionCap);
  });

  it("counts a choice answered through the fold after a suspension, and keeps a late repeat's detection across reloads", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.optionalEcho.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let slice: BattleSlice = { committed: { ...state, config: { ...state.config, mandatoryLoopCheckFrom: 1 } }, inFlight: null, publishedEvents: 0, attempt: 0 };
    const reduce = (intent: Parameters<typeof fold.reduce>[1]) => {
      const outcome = fold.reduce(slice, intent);
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("intent failed");
      slice = outcome.slice;
    };
    reduce({ kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    for (let answer = 0; answer <= 20; answer++) {
      const pending = fold.pending(slice);
      if (pending === null) throw new Error("no prompt");
      reduce({ kind: "answer", side: "player", promptId: pending.prompt.id, value: answer < 20 });
    }
    expect(fold.pending(slice)).toBeNull();
    expect(slice.committed.result).toBeNull();
    expect(engine.decision(slice.committed)).toEqual({ kind: "main", side: "player" });

    // Reloading between every automatic step reaches the same draw at the same step.
    const late = board({ player: { hand: [CYCLE.lateEcho.id], energy: 1, deck }, enemy: { deck } });
    const config = { ...late.state.config, resolutionCap: 16, mandatoryLoopCheckFrom: 1, mandatoryLoopWindow: 4 };
    const whole = playOnly({ ...late.state, config }, late.ids.player.hand);
    const lateCard = late.ids.player.hand[0];
    if (lateCard === undefined) throw new Error("no card");
    const played = runStep({ ...late.state, config }, { kind: "play", card: lateCard, from: "hand" }, NO_PROMPTS, engine.catalog);
    if (played.kind !== "done") throw new Error("suspended");
    let current = played.state;
    for (;;) {
      const step = nextAutomaticStep(current, engine.catalog, engine.memo);
      if (step === null) break;
      const result = runStep(deserializeState(serializeState(current)), step, NO_PROMPTS, engine.catalog, { automatic: true });
      if (result.kind !== "done") throw new Error("suspended");
      current = result.state;
    }
    expect(current.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(stateHash(current)).toBe(stateHash(whole.state));
  });

  it("keeps a cycle mandatory when its only prompt is a forced choice", () => {
    const { state, ids } = board({ player: { hand: [CYCLE.targetedEcho.id], energy: 1, deck }, enemy: { deck } });
    const result = playOnly(state, ids.player.hand);
    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.answers.every((answer) => answer.auto === true)).toBe(true);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
  });
});
