/**
 * Loops (rules § Infinite Loops), on synthetic fixtures: the optional-loop
 * shortcut (offer, execution, embedded prompts, early stops, reload) and
 * mandatory cycles (an exact repeat, a late-entered repeat, the resolution
 * cap, and the choices that make a sequence not mandatory).
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { energy } from "../dsl/builders";
import { triggered, whenOpponentPlays } from "../dsl/triggers";
import * as p from "../effects/primitives";
import { createEngine, IllegalAction } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import type { Action } from "../rules/actions";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { nextAutomaticStep, runToDecision } from "../steps/driver";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { boardState, type BoardSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { CYCLE, CYCLE_CARDS, LOOP, LOOP_CARDS } from "../testing/loop-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { TRIGGER } from "../testing/trigger-cards";
import type { LoopEndReason } from "./types";

/** "When the opponent plays a card, you may lose 1●." — gives the opponent of a loop of plays a real choice. */
const reluctant: EngineCardDefinition = {
  id: syntheticId(0xd20),
  cardType: "character",
  costs: [energy(1)],
  spark: 1,
  subtype: "Warrior",
  speed: "standard",
  status: "authored",
  abilities: () => [triggered(whenOpponentPlays(), p.optional(p.gainEnergy(-1)))],
};

const engine = createEngine(testCatalog([...LOOP_CARDS, ...CYCLE_CARDS, reluctant, TRIGGER.secondCardPoints]));
const v = SYNTHETIC;
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup });
}

function sourceOf(ids: { back: (InstanceId | null)[] }): InstanceId {
  const source = ids.back[0];
  if (source == null) throw new Error("no source");
  return source;
}

function activate(state: BattleState, source: InstanceId, answers: AnswerSource = NO_PROMPTS) {
  return engine.apply(state, "player", { kind: "activate", source, ability: 0 }, answers);
}

/** The `repeatLoop` action on offer to `side`. */
function offer(state: BattleState, side: Side = "player"): Extract<Action, { kind: "repeatLoop" }> | undefined {
  return engine.legalActions(state, side).find((action) => action.kind === "repeatLoop");
}

function repeat(state: BattleState, count: number | "untilVictory") {
  const loop = offer(state);
  if (loop === undefined) throw new Error("no loop on offer");
  return engine.apply(state, "player", { ...loop, count }, NO_PROMPTS);
}

function ended(events: readonly EngineEvent[]): { iterations: number; reason: LoopEndReason } | undefined {
  const event = events.find((entry) => entry.kind === "loopEnded");
  return event?.kind === "loopEnded" ? { iterations: event.iterations, reason: event.reason } : undefined;
}

/** A free "Gain 1⍟" activation taken once, which puts its loop on offer. */
function freePointsOffered(setup: Partial<BoardSetup> = {}) {
  const { state, ids } = board({ player: { back: [LOOP.freePoints.id], deck }, enemy: { deck }, ...setup });
  const source = sourceOf(ids.player);
  const once = activate(state, source);
  return { start: state, state: once.state, source };
}

describe("optional loops", () => {
  it("offers a loop that gains for its player and repeats it until victory", () => {
    const { start, state } = freePointsOffered({ scoreToWin: 10 });
    expect(offer(start)).toBeUndefined();
    expect(state.sides.player.score).toBe(1);
    expect(offer(state)).toEqual({ kind: "repeatLoop", loop: state.loops.candidate?.id, count: "untilVictory" });
    expect(engine.view(state, "enemy").loop).toEqual({ id: state.loops.candidate?.id, side: "player", run: null });
    const steps: BattleState[] = [];
    const loop = offer(state);
    if (loop === undefined) throw new Error("no offer");
    const result = engine.apply(state, "player", loop, NO_PROMPTS, (next) => steps.push(next));
    expect(result.state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(result.state.sides.player.score).toBe(10);
    expect(ended(result.events)).toEqual({ iterations: 8, reason: "battleEnded" });
    expect(result.events.filter((event) => event.kind === "abilityResolved")).toHaveLength(9);
    for (const step of steps) expect(invariantViolations(step, engine.catalog)).toEqual([]);
  });

  it("repeats a loop the chosen number of times and keeps it on offer", () => {
    const { state } = freePointsOffered();
    const id = state.loops.candidate?.id;
    const result = repeat(state, 3);
    expect(result.state.sides.player.score).toBe(4);
    expect(ended(result.events)).toEqual({ iterations: 3, reason: "completed" });
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
    expect(offer(result.state)?.loop).toBe(id);
    expect(result.state.loops.run).toBeNull();
  });

  it("stops at the iteration cap", () => {
    const { state } = freePointsOffered();
    const capped: BattleState = { ...state, config: { ...state.config, loopIterationCap: 3 } };
    const result = repeat(capped, "untilVictory");
    expect(result.state.sides.player.score).toBe(4);
    expect(ended(result.events)).toEqual({ iterations: 3, reason: "iterationCap" });
    expect(offer(result.state)).toBeDefined();
  });

  it("rejects a count outside 1 to the iteration cap, and a loop not on offer", () => {
    const { state } = freePointsOffered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no offer");
    for (const count of [0, 1.5, state.config.loopIterationCap + 1]) {
      expect(() => engine.apply(state, "player", { ...loop, count }, NO_PROMPTS)).toThrow(IllegalAction);
    }
    expect(() => engine.apply(state, "player", { ...loop, loop: "l999" }, NO_PROMPTS)).toThrow(IllegalAction);
    expect(() => engine.apply(state, "player", { ...loop, count: 1 }, NO_PROMPTS)).not.toThrow();
  });

  it("records every answer of the loop with its fingerprint and replays it", () => {
    const { state, ids } = board({ player: { back: [LOOP.freeChoice.id], deck }, enemy: { deck } });
    const once = activate(state, sourceOf(ids.player), new ScriptedSource([1]));
    expect(once.state.sides.player.currentEnergy).toBe(1);
    const recorded = once.state.loops.candidate?.actions.flatMap((action) => action.steps.flatMap((step) => step.answers));
    expect(recorded).toEqual(once.answers);
    expect(recorded?.[0]?.value).toBe(1);
    const result = repeat(once.state, 4);
    expect(result.state.sides.player.currentEnergy).toBe(5);
    expect(result.state.sides.player.score).toBe(0);
    expect(ended(result.events)).toEqual({ iterations: 4, reason: "completed" });
  });

  it("stops when a replayed choice offers different options, leaving the choice to its player", () => {
    const { state, ids } = board({ player: { back: [LOOP.thresholdChoice.id], deck }, enemy: { deck } });
    const source = sourceOf(ids.player);
    const once = activate(state, source);
    expect(once.answers.every((answer) => answer.auto === true)).toBe(true);
    const result = repeat(once.state, "untilVictory");
    // Iterations from 1● and 2● replay the forced choice; at 3● both alternatives are affordable.
    expect(ended(result.events)).toEqual({ iterations: 2, reason: "changedChoice" });
    expect(result.state.sides.player.currentEnergy).toBe(3);
    expect(result.state.stack).toEqual([]);
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
    expect(offer(result.state)).toBeUndefined();
    const manual = activate(result.state, source, new ScriptedSource([1]));
    expect(manual.answers.filter((answer) => answer.auto !== true)).toHaveLength(1);
    expect(manual.state.sides.player.currentEnergy).toBe(4);
  });

  it("stops when the opponent gains a legal response, handing them the decision", () => {
    const { state } = freePointsOffered({ enemy: { hand: [LOOP.lateResponse.id], deck } });
    const result = repeat(state, 10);
    // The third replayed activation finds the opponent at 3⍟ with a legal response.
    expect(ended(result.events)).toEqual({ iterations: 2, reason: "opponentDecision" });
    expect(result.state.sides.player.score).toBe(3);
    expect(result.state.stack).toHaveLength(1);
    expect(engine.decision(result.state)).toEqual({ kind: "respond", side: "enemy" });
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("stops when a recorded action is no longer legal", () => {
    const { state, source } = freePointsOffered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no offer");
    const accepted = runStep(state, { kind: "repeatLoop", loop: loop.loop, count: 5 }, NO_PROMPTS, engine.catalog);
    if (accepted.kind !== "done") throw new Error("suspended");
    // Stale input: the loop's source has left play since the loop was recorded.
    const stale = deserializeState(serializeState(accepted.state));
    stale.sides.player.backRank[0] = null;
    stale.sides.player.void.push(source);
    const instance = stale.instances[source];
    if (instance === undefined) throw new Error("no source");
    instance.zone = "void";
    const result = runToDecision(stale, { kind: "loopIteration" }, NO_PROMPTS, engine.catalog, engine.memo, undefined, true);
    expect(ended(result.events)).toEqual({ iterations: 0, reason: "illegalAction" });
    expect(result.state.sides.player.score).toBe(1);
    expect(result.state.loops.run).toBeNull();
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });

  it("discards a replayed automatic step whose prompts changed and runs it on live", () => {
    const { state } = freePointsOffered();
    const candidate = state.loops.candidate;
    if (candidate === null) throw new Error("no candidate");
    const [action] = candidate.actions;
    const [activation, resolution] = action?.steps ?? [];
    if (activation === undefined || resolution === undefined) throw new Error("unexpected recording");
    // The recorded resolution answered a prompt that the replay no longer raises.
    const bogus = { fingerprint: activation.answers[0]?.fingerprint ?? ("x" as never), value: true };
    const tampered: BattleState = {
      ...state,
      loops: { ...state.loops, candidate: { ...candidate, actions: [{ steps: [activation, { ...resolution, answers: [bogus] }] }] } },
    };
    const result = repeat(tampered, 3);
    expect(ended(result.events)).toEqual({ iterations: 0, reason: "changedChoice" });
    // The activation was replayed; its resolution then ran as an ordinary automatic step.
    expect(result.state.sides.player.score).toBe(2);
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });

  it("does not offer a sequence without a gain, or one the opponent had a decision in", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], deck }, enemy: { deck } });
    const card = sourceOf(ids.player);
    const moved = engine.apply(state, "player", { kind: "reposition", card, to: { rank: "back", index: 1 } }, NO_PROMPTS);
    const back = engine.apply(moved.state, "player", { kind: "reposition", card, to: { rank: "back", index: 0 } }, NO_PROMPTS);
    expect(offer(back.state)).toBeUndefined();

    const contested = board({ player: { back: [LOOP.freePoints.id], deck }, enemy: { hand: [v.interruptEvent.id], energy: 1, deck } });
    const played = activate(contested.state, sourceOf(contested.ids.player));
    expect(engine.decision(played.state)).toEqual({ kind: "respond", side: "enemy" });
    const passed = engine.apply(played.state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(passed.state.sides.player.score).toBe(1);
    expect(offer(passed.state)).toBeUndefined();
  });

  it("offers and replays a loop of plays with triggered abilities", () => {
    const { state, ids } = board({ player: { hand: [LOOP.bouncer.id], deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const playCard = (from: BattleState) => engine.apply(from, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    // The play returns the card to hand as it was drawn, so one play is a loop.
    const once = playCard(state);
    expect(once.state.sides.player.hand).toEqual([card]);
    const result = repeat(once.state, 3);
    expect(ended(result.events)).toEqual({ iterations: 3, reason: "completed" });
    expect(result.state.sides.player.score).toBe(4);
    expect(result.events.filter((event) => event.kind === "triggerResolved")).toHaveLength(3);
  });

  it("offers a loop of plays as the turn log grows, and stops a repetition a play-count trigger diverges", () => {
    // "When you play your second card in a turn, gain 1⍟" counts the turn log, which the loop signature leaves out (RD-hv-7x4l.36-1).
    const { state, ids } = board({ player: { back: [TRIGGER.secondCardPoints.id], hand: [LOOP.bouncer.id], deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const playCard = (from: BattleState) => engine.apply(from, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    const second = playCard(playCard(state).state);
    // The offered pass includes the second-card trigger, which no repetition triggers again.
    expect(second.state.sides.player.score).toBe(3);
    const diverged = repeat(second.state, 5);
    expect(ended(diverged.events)).toEqual({ iterations: 0, reason: "diverged" });
    // The replayed play is kept and its own trigger resolves.
    expect(diverged.state.sides.player.score).toBe(4);
    expect(engine.decision(diverged.state)).toEqual({ kind: "main", side: "player" });
    expect(offer(diverged.state)).toBeUndefined();
    // One more pass by hand puts the loop as it now repeats on offer.
    const again = playCard(diverged.state);
    expect(again.state.sides.player.score).toBe(5);
    const result = repeat(again.state, 5);
    expect(ended(result.events)).toEqual({ iterations: 5, reason: "completed" });
    expect(result.state.sides.player.score).toBe(10);
    expect(offer(result.state)).toBeDefined();
  });

  it("does not offer a sequence in which the opponent made a choice", () => {
    const { state, ids } = board({ player: { hand: [LOOP.bouncer.id], deck }, enemy: { back: [reluctant.id], energy: 1, deck } });
    const card = ids.player.hand[0];
    if (card === undefined) throw new Error("no card");
    const playCard = (from: BattleState) => engine.apply(from, "player", { kind: "play", card, from: "hand" }, new ScriptedSource([false]));
    let current = state;
    for (let count = 0; count < 3; count++) {
      const played = playCard(current);
      expect(played.answers.filter((answer) => answer.auto !== true)).toHaveLength(1);
      current = played.state;
    }
    expect(current.sides.player.score).toBe(3);
    expect(current.sides.enemy.currentEnergy).toBe(1);
    expect(offer(current)).toBeUndefined();
  });

  it("does not offer a loop longer than the battle's history limit", () => {
    const { state, ids } = board({ player: { back: [LOOP.freePoints.id], deck }, enemy: { deck } });
    const limited: BattleState = { ...state, config: { ...state.config, loopHistoryActions: 0 } };
    const once = activate(limited, sourceOf(ids.player));
    expect(once.state.sides.player.score).toBe(1);
    expect(offer(once.state)).toBeUndefined();
  });

  it("withdraws the offer once its player does something else", () => {
    const { state } = freePointsOffered();
    const passed = engine.apply(state, "player", { kind: "pass" }, NO_PROMPTS);
    expect(passed.state.loops.candidate).toBeNull();
    expect(engine.view(passed.state, "player").loop).toBeNull();
  });

  it("survives a reload between iterations with the same result", () => {
    const { state } = freePointsOffered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no offer");
    const whole = engine.apply(state, "player", { ...loop, count: 4 }, NO_PROMPTS);
    const accepted = runStep(state, { kind: "repeatLoop", loop: loop.loop, count: 4 }, NO_PROMPTS, engine.catalog);
    if (accepted.kind !== "done") throw new Error("suspended");
    let current = accepted.state;
    for (;;) {
      const step = nextAutomaticStep(current, engine.catalog, engine.memo);
      if (step === null) break;
      const result = runStep(deserializeState(serializeState(current)), step, NO_PROMPTS, engine.catalog, { automatic: true });
      if (result.kind !== "done") throw new Error("suspended");
      current = result.state;
      expect(current.loops.run === null || current.loops.run.iterations > 0).toBe(true);
    }
    expect(stateHash(current)).toBe(stateHash(whole.state));
  });

  it("runs a repetition through the fold, matching the inline result, and bounces a stale offer", () => {
    const { state } = freePointsOffered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no offer");
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(slice, { kind: "battleAction", side: "player", action: { ...loop, count: 3 } });
    if (outcome.kind !== "applied") throw new Error(outcome.reason);
    expect(outcome.error).toBeNull();
    const inline = engine.apply(state, "player", { ...loop, count: 3 }, NO_PROMPTS);
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(inline.state));
    expect(outcome.published).toEqual(inline.events);
    expect(fold.pending(outcome.slice)).toBeNull();
    const stale = fold.reduce(outcome.slice, { kind: "battleAction", side: "player", action: { ...loop, loop: "l999", count: 1 } });
    expect(stale).toEqual({ kind: "bounced", reason: "illegalAction" });
    const enemy = fold.reduce(outcome.slice, { kind: "battleAction", side: "enemy", action: { ...loop, count: 1 } });
    expect(enemy).toEqual({ kind: "bounced", reason: "notYourDecision" });
  });

  it("returns a changed choice to its player through the fold, who then answers it", () => {
    const { state, ids } = board({ player: { back: [LOOP.thresholdChoice.id], deck }, enemy: { deck } });
    const source = sourceOf(ids.player);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const reduce = (intent: Parameters<typeof fold.reduce>[1]) => {
      const outcome = fold.reduce(slice, intent);
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("intent failed");
      slice = outcome.slice;
      return outcome;
    };
    reduce({ kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } });
    const loop = offer(slice.committed);
    if (loop === undefined) throw new Error("no offer");
    const repeated = reduce({ kind: "battleAction", side: "player", action: loop });
    expect(ended(repeated.published)).toEqual({ iterations: 2, reason: "changedChoice" });
    expect(fold.pending(slice)).toBeNull();
    reduce({ kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } });
    const pending = fold.pending(slice);
    expect(pending?.prompt).toMatchObject({ kind: "chooseMode", side: "player", options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
    if (pending === null) throw new Error("no prompt");
    reduce({ kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 });
    expect(slice.committed.sides.player.currentEnergy).toBe(1);
    expect(engine.decision(slice.committed)).toEqual({ kind: "main", side: "player" });
  });
});

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
