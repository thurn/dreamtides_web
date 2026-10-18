/** The frozen Phase 5 Greedy (`greedy@5`): finite loop execution, productive progress, privacy and recorded-answer replay. */
import { describe, expect, it } from "vitest";
import { AI } from "../../content/ai";
import type { EngineCardDefinition } from "../catalog";
import { activated } from "../dsl/builders";
import { onDusk, triggered } from "../dsl/triggers";
import { gainEnergy, gainPoints } from "../effects/primitives";
import { createEngine, type Engine } from "../engine";
import { decisionKeyOf, type BattleSlice } from "../fold/slice";
import { allowedBy, type Action } from "../rules/actions";
import { cloneState } from "../state/clone";
import { stateHash } from "../state/hash";
import { battleSeed, opponent, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { boardState } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { LOOP } from "../testing/loop-cards";
import { syntheticId, testCatalog } from "../testing/synthetic-cards";
import { runPolicy, type PolicyRequest } from "./decide";
import { weak, strong, engine, board, deck, entries } from "./policy.fixtures";

function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

describe("Greedy", () => {
  function loopDecklists(side: Side, mine: Parameters<typeof entries>[0], theirs: Parameters<typeof entries>[0] = deck): PolicyRequest["decklists"] {
    return side === "player" ? { player: entries(mine), enemy: entries(theirs) } : { player: entries(theirs), enemy: entries(mine) };
  }

  function loopRequest(looping: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]): PolicyRequest {
    const decision = looping.decision(state);
    if (decision?.side !== side) throw new Error("wrong loop actor");
    return {
      policy: "greedy@5", side, key: decisionKeyOf(sliceOf(state)), view: looping.view(state, side),
      decision: { kind: "topLevel", decision, legal: looping.legalActions(state, side) },
      decklists, seed: battleSeed(`loop-budget|${side}`), budget: { iterations: 64 },
    };
  }

  function applyLoopChoice(looping: Engine, state: BattleState, side: Side, action: Action) {
    expect(looping.legalActions(state, side).some(legal => allowedBy(legal, action, state))).toBe(true);
    let steps = 0;
    if (action.kind === "repeatLoop") {
      expect(typeof action.count).toBe("number");
      expect(action.count).toBeGreaterThanOrEqual(1);
      expect(action.count).toBeLessThanOrEqual(Math.min(AI.references["greedy@5"].loopIterationLimit, state.config.loopIterationCap));
    }
    const result = looping.apply(state, side, action, NO_PROMPTS, (_after, step) => { if (step.kind === "loopIteration") steps++; });
    if (action.kind === "repeatLoop") {
      if (typeof action.count !== "number") throw new Error("unbounded chosen loop");
      expect(steps).toBeLessThanOrEqual(action.count);
      expect(result.events.some(event => event.kind === "loopEnded" && event.loop === action.loop)).toBe(true);
    }
    expect(result.state.loops.run).toBeNull();
    expect(invariantViolations(result.state, looping.catalog)).toEqual([]);
    return result;
  }

  function replayLoopChoices(looping: Engine, initial: BattleState, records: readonly { side: Side; action: Action; answers: readonly RecordedAnswer[] }[], final: BattleState) {
    let replay = cloneState(initial);
    for (const record of records) {
      const answers = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value));
      replay = looping.apply(replay, record.side, record.action, answers).state;
      answers.assertExhausted();
    }
    expect(stateHash(replay)).toBe(stateHash(final));
  }

  for (const side of ["player", "enemy"] as const) {
    it.each([10, 2 * AI.references["greedy@5"].loopIterationLimit + 3])(`executes ${side}'s winning loop through legal finite choices to %s points`, target => {
      const other = opponent(side);
      const { state, ids } = board({ active: side, [side]: { back: [LOOP.freePoints.id], deck }, [other]: { deck }, scoreToWin: target });
      const source = ids[side].back[0];
      if (source == null) throw new Error("no source");
      const once = engine.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
      const decklists = loopDecklists(side, [LOOP.freePoints.id, ...deck]);
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      let current = once;
      for (let guard = 0; guard < target && current.result === null; guard++) {
        const request = loopRequest(engine, current, side, decklists), before = JSON.stringify({ current, request });
        const result = runPolicy(engine, request);
        expect(runPolicy(createEngine(engine.catalog), structuredClone(request))).toEqual(result);
        expect(JSON.stringify({ current, request })).toBe(before);
        expect(result.trace.used.iterations).toBeLessThanOrEqual(request.budget.iterations);
        expect(result.trace.chosen).toEqual(result.choice);
        expect(result.trace.candidates[0]?.choice).toEqual(result.choice);
        if (result.choice.kind !== "action" || result.choice.action.kind !== "repeatLoop") throw new Error("winning loop not selected");
        const after = applyLoopChoice(engine, current, side, result.choice.action);
        expect(after.state.sides[side].score).toBeGreaterThan(current.sides[side].score);
        records.push({ side, action: result.choice.action, answers: after.answers });
        current = after.state;
      }
      expect(current.result).toMatchObject({ kind: "victory", winner: side });
      if (target > AI.references["greedy@5"].loopIterationLimit + 1) expect(records.length).toBeGreaterThan(1);
      replayLoopChoices(engine, once, records, current);
    });

    it.each([undefined, 1])(`bounds ${side}'s executed energy loop with battle cap %s and leaves its saturated adverse window`, battleCap => {
      const energyLoop: EngineCardDefinition = {
        ...LOOP.freePoints, id: syntheticId(0x4514), spark: 0,
        abilities: () => [activated([], gainEnergy(1)), triggered(onDusk(), gainPoints(100, "opponent"))],
      };
      const looping = createEngine(testCatalog([energyLoop])), other = opponent(side);
      const { state, ids } = boardState(looping.catalog, { active: side, phase: "day", [side]: { back: [energyLoop.id], deck }, [other]: { deck } });
      const source = ids[side].back[0];
      if (source == null) throw new Error("no source");
      const activatedState = looping.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
      const once = battleCap === undefined ? activatedState : { ...activatedState, config: { ...activatedState.config, loopIterationCap: battleCap } };
      const legal = looping.legalActions(once, side), loop = legal.find(action => action.kind === "repeatLoop");
      expect(loop?.count).toBe("untilVictory");
      const observed: { count: number | "untilVictory"; steps: number; iterations: number }[] = [];
      // Delegate all work to the real engine and observe its public steps/events.
      const observedEngine: Engine = {
        ...looping,
        apply(current, actor, action, answers, observe) {
          if (action.kind !== "repeatLoop") return looping.apply(current, actor, action, answers, observe);
          const run = { count: action.count, steps: 0, iterations: 0 };
          observed.push(run);
          const result = looping.apply(current, actor, action, answers, (after, step, events) => {
            if (step.kind === "loopIteration") run.steps++;
            observe?.(after, step, events);
          });
          for (const event of result.events) if (event.kind === "loopEnded" && event.loop === action.loop) run.iterations += event.iterations;
          return result;
        },
      };
      const request = loopRequest(looping, once, side, loopDecklists(side, [energyLoop.id, ...deck]));
      const before = JSON.stringify({ once, request });
      const result = runPolicy(observedEngine, request);
      const limit = AI.references["greedy@5"].loopIterationLimit, effectiveLimit = Math.min(limit, once.config.loopIterationCap);
      expect(observed.length).toBeGreaterThan(0);
      for (const run of observed) {
        expect(typeof run.count).toBe("number");
        expect(run.count).toBeGreaterThanOrEqual(1);
        expect(run.count).toBeLessThanOrEqual(effectiveLimit);
        expect(run.steps).toBeLessThanOrEqual(effectiveLimit);
        expect(run.iterations).toBeLessThanOrEqual(effectiveLimit);
        expect(run.iterations).toBeGreaterThan(0);
      }
      expect(result.trace.used.iterations).toBeLessThanOrEqual(request.budget.iterations);
      expect(result.trace.loopSimulation).toEqual({ iterationLimit: limit, simulations: observed.length, iterations: observed.reduce((sum, run) => sum + run.iterations, 0) });
      expect(result.trace.chosen).toEqual(result.choice);
      if (result.choice.kind !== "action") throw new Error("not an action");
      if (battleCap === undefined) {
        expect(result.choice.action.kind).toBe("repeatLoop");
        if (result.choice.action.kind !== "repeatLoop") throw new Error("productive loop not selected");
        const selectedCount = result.choice.action.count;
        expect(observed.every(run => run.count === selectedCount)).toBe(true);
      }
      expect(JSON.stringify({ once, request })).toBe(before);
      expect(looping.legalActions(once, side)).toEqual(legal);
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      let current = once;
      for (let guard = 0; guard < AI.references["greedy@5"].energyValueCap + 2 && current.turn.phase === "day"; guard++) {
        const chosen = guard === 0 ? result : runPolicy(looping, loopRequest(looping, current, side, request.decklists));
        if (chosen.choice.kind !== "action") throw new Error("not an action");
        const next = applyLoopChoice(looping, current, side, chosen.choice.action);
        records.push({ side, action: chosen.choice.action, answers: next.answers });
        current = next.state;
      }
      expect(current.turn.phase).not.toBe("day");
      expect(current.sides[side].currentEnergy).toBeGreaterThanOrEqual(AI.references["greedy@5"].energyValueCap);
      expect(current.sides[other].score).toBeGreaterThan(once.sides[other].score);
      replayLoopChoices(looping, once, records, current);
    });

    it(`chooses ${side}'s finite loop from the view alone despite hidden allocation and battle seed`, () => {
      const other = opponent(side);
      const { state, ids } = board({ active: side, [side]: { back: [LOOP.freePoints.id], deck }, [other]: { hand: [strong.id], deck: [weak.id, ...deck] }, scoreToWin: 10 });
      const source = ids[side].back[0];
      if (source == null) throw new Error("no source");
      const once = engine.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
      const hiddenBefore = { ...cloneState(state), seed: battleSeed("hidden-loop-battle") };
      const hand = hiddenBefore.sides[other].hand[0], top = hiddenBefore.sides[other].deck[0];
      const handPrinting = hiddenBefore.instances[hand].printing;
      hiddenBefore.instances[hand] = { ...hiddenBefore.instances[hand], printing: hiddenBefore.instances[top].printing };
      hiddenBefore.instances[top] = { ...hiddenBefore.instances[top], printing: handPrinting };
      // Record each loop after the private allocation, keeping its actual signature valid.
      const hidden = engine.apply(hiddenBefore, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
      const decklists = loopDecklists(side, [LOOP.freePoints.id, ...deck], [strong.id, weak.id, ...deck]);
      const first = loopRequest(engine, once, side, decklists), second = loopRequest(engine, hidden, side, decklists);
      expect(second).toEqual(first);
      const chosen = runPolicy(engine, first);
      expect(runPolicy(createEngine(engine.catalog), second)).toEqual(chosen);
      if (chosen.choice.kind !== "action" || chosen.choice.action.kind !== "repeatLoop") throw new Error("no chosen loop");
      for (const actual of [once, hidden]) expect(applyLoopChoice(engine, actual, side, chosen.choice.action).state.result).toMatchObject({ kind: "victory", winner: side });
    });

    it.each(["error", "non-settling"] as const)(`rejects ${side}'s %s loop simulation while retaining legal progress`, failure => {
      const energyLoop: EngineCardDefinition = { ...LOOP.freePoints, id: syntheticId(0x4515), spark: 0, abilities: () => [activated([], gainEnergy(1)), triggered(onDusk(), gainPoints(100, "opponent"))] };
      const looping = createEngine(testCatalog([energyLoop])), other = opponent(side);
      const { state, ids } = boardState(looping.catalog, { active: side, phase: "day", [side]: { back: [energyLoop.id], energy: AI.references["greedy@5"].energyValueCap, deck }, [other]: { deck } });
      const source = ids[side].back[0];
      if (source == null) throw new Error("no source");
      const once = looping.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
      const stuck = new WeakSet<BattleState>();
      const failing: Engine = {
        ...looping,
        decision(current) { return stuck.has(current) ? { kind: "respond", side } : looping.decision(current); },
        apply(current, actor, action, answers, observe) {
          if (stuck.has(current) && action.kind === "pass") return { state: current, events: [], answers: [], bounded: [] };
          if (action.kind === "repeatLoop" && failure === "error") throw new Error("loop simulation failure");
          const result = looping.apply(current, actor, action, answers, observe);
          if (action.kind === "repeatLoop") stuck.add(result.state);
          return result;
        },
      };
      const request = loopRequest(looping, once, side, loopDecklists(side, [energyLoop.id, ...deck])), before = JSON.stringify({ once, request });
      const result = runPolicy(failing, request);
      expect(result.choice).toEqual({ kind: "action", action: { kind: "pass" } });
      expect(result.trace.candidates.some(candidate => candidate.choice.kind === "action" && candidate.choice.action.kind === "repeatLoop")).toBe(false);
      expect(JSON.stringify({ once, request })).toBe(before);
      if (result.choice.kind !== "action") throw new Error("not an action");
      expect(applyLoopChoice(looping, once, side, result.choice.action).state.turn.phase).not.toBe("day");
    });
  }

});
