/** Main-window plays include their phase boundary without constraining legal Phasing loops. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { event, stackItem } from "../dsl/builders";
import { atEndOfTurn, onDusk, onMaterialized, triggered } from "../dsl/triggers";
import { draw, gainPoints, phasing, prevent } from "../effects/primitives";
import { createEngine, type Engine } from "../engine";
import type { Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { cloneState } from "../state/clone";
import { stateHash } from "../state/hash";
import { battleSeed, opponent, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource, NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { boardState } from "../testing/board";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { runPolicy, type PolicyRequest } from "./decide";
import { deck, entries } from "./policy.fixtures";

const phaseA: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7461), spark: 2, speed: "fast", status: "authored", abilities: () => [phasing()] };
const phaseB: EngineCardDefinition = { ...phaseA, id: syntheticId(0x7462) };
const adverse: EngineCardDefinition = { ...SYNTHETIC.vanilla8, id: syntheticId(0x7463), status: "authored", abilities: () => [triggered(atEndOfTurn("you"), gainPoints(1, "opponent"))] };
function lists(side: Side, mine: Parameters<typeof entries>[0], theirs: Parameters<typeof entries>[0] = deck): PolicyRequest["decklists"] {
  return side === "player" ? { player: entries(mine), enemy: entries(theirs) } : { player: entries(theirs), enemy: entries(mine) };
}
function fixture(side: Side, benefit?: "spark" | "points") {
  const played: EngineCardDefinition = { ...phaseB, spark: benefit === "spark" ? 4 : 2, abilities: () => [phasing(), ...(benefit === "points" ? [triggered(onMaterialized(), gainPoints(1))] : [])] };
  const engine = createEngine(testCatalog([phaseA, played, adverse]));
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "night", ...(benefit === "points" ? { scoreToWin: 1 } : {}), [side]: { back: [phaseA.id, adverse.id], hand: [played.id], deck }, [opponent(side)]: { deck } });
  const decklists = lists(side, [phaseA.id, played.id, adverse.id, ...deck]);
  return { engine, state, ids, decklists };
}
function request(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]): PolicyRequest {
  const decision = engine.decision(state);
  if (decision?.side !== side) throw new Error("wrong actor");
  return { policy: "greedy", side, key: `${state.version}:0:decision`, view: engine.view(state, side), decision: { kind: "topLevel", decision, legal: engine.legalActions(state, side) }, decklists, seed: battleSeed("phasing-cycle"), budget: { iterations: 64 } };
}
function action(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]) {
  const input = request(engine, state, side, decklists), before = JSON.stringify({ state, input });
  const result = runPolicy(engine, input);
  expect(runPolicy(createEngine(engine.catalog), structuredClone(input))).toEqual(result);
  expect(JSON.stringify({ state, input })).toBe(before);
  expect(result.trace.used.iterations).toBeLessThanOrEqual(input.budget.iterations);
  if (result.choice.kind !== "action") throw new Error("not an action");
  expect(input.decision.kind === "topLevel" && input.decision.legal).toContainEqual(result.choice.action);
  return result.choice.action;
}
function answers(engine: Engine, decklists: PolicyRequest["decklists"]) {
  const answer = (prompt: Prompt, work: BattleState) => {
    const state = cloneState(work), side = prompt.side;
    const result = runPolicy(engine, { policy: "greedy", side, key: `${state.version}:0:decision`, view: engine.view(state, side), decision: { kind: "prompt", prompt }, decklists, seed: battleSeed("phasing-answer"), budget: { iterations: 64 } });
    if (result.choice.kind !== "answer") throw new Error("not an answer");
    return result.choice.value;
  };
  return new InlineSource({ player: answer, enemy: answer });
}

describe("Phasing play horizon", () => {
  for (const side of ["player", "enemy"] as const) {
    it(`ends ${side}'s neutral Phasing cycle while keeping its legal swaps and recorded-answer replay`, () => {
      const { engine, state, ids, decklists } = fixture(side), source = answers(engine, decklists);
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      let current = state;
      const apply = (move: Action) => { const next = engine.apply(current, side, move, source); records.push({ side, action: move, answers: next.answers }); current = next.state; };
      // Human play retains both physical swaps, even though Greedy can leave this cycle.
      for (const card of [ids[side].hand[0], ids[side].back[0]!]) {
        const move = { kind: "play" as const, card, from: "hand" as const };
        expect(engine.legalActions(current, side)).toContainEqual(move);
        apply(move);
        expect(current.turn.phase).toBe("night");
      }
      expect(current.sides[side].hand).toEqual(state.sides[side].hand);
      expect(current.sides[side].backRank).toEqual(state.sides[side].backRank);
      expect(records.some(record => record.answers.some(answer => !answer.auto))).toBe(true);
      expect(action(engine, current, side, decklists)).toEqual({ kind: "pass" });
      apply({ kind: "pass" });
      expect(current.turn.active).toBe(opponent(side));
      expect(current.turn.phase).toBe("day");
      expect(current.sides[opponent(side)].score).toBe(1);
      let replay = cloneState(state);
      for (const record of records) { const source = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value)); replay = engine.apply(replay, record.side, record.action, source).state; source.assertExhausted(); }
      expect(stateHash(replay)).toBe(stateHash(current));
    });

    it.each(["spark", "points"] as const)(`keeps ${side}'s beneficial %s Phasing play`, benefit => {
      const { engine, state, ids, decklists } = fixture(side, benefit);
      const move = action(engine, state, side, decklists);
      expect(move).toEqual({ kind: "play", card: ids[side].hand[0], from: "hand" });
      const after = engine.apply(state, side, move, answers(engine, decklists)).state;
      if (benefit === "points") expect(after.result).toMatchObject({ kind: "victory", winner: side });
      else expect(after.sides[side].backRank).toContain(ids[side].hand[0]);
    });

    it(`keeps ${side}'s finite useful ordinary play`, () => {
      const card: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x7464), status: "authored", abilities: () => [event(draw(2))] };
      const engine = createEngine(testCatalog([card])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card.id], deck }, [other]: { deck } });
      const decklists = lists(side, [card.id, ...deck]);
      expect(action(engine, state, side, decklists)).toEqual({ kind: "play", card: ids[side].hand[0], from: "hand" });
    });

    it(`keeps ${side}'s useful Interrupt at its response horizon`, () => {
      const counter: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x7465), speed: "interrupt", status: "authored", abilities: () => [event(prevent(stackItem({ controller: "opponent" })))] };
      const threat: EngineCardDefinition = { ...counter, id: syntheticId(0x7466), abilities: () => [event(gainPoints(3))] };
      const hazard: EngineCardDefinition = { ...adverse, abilities: () => [triggered(onDusk(), gainPoints(100, "opponent"))] };
      const engine = createEngine(testCatalog([counter, threat, hazard])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [hazard.id], hand: [SYNTHETIC.event0.id, counter.id], deck }, [other]: { hand: [threat.id], deck } });
      const decklists = lists(side, [hazard.id, SYNTHETIC.event0.id, counter.id, ...deck], [threat.id, ...deck]);
      const first = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS).state;
      const pending = engine.apply(first, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, NO_PROMPTS).state;
      const move = action(engine, pending, side, decklists);
      expect(move).toEqual({ kind: "play", card: ids[side].hand[1], from: "hand" });
      let after = engine.apply(pending, side, move, answers(engine, decklists)).state;
      while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(after.turn.phase).toBe("day");
      expect(after.sides[other].score).toBe(0);
    });

    it.each(["error", "non-settling"] as const)(`rejects ${side}'s %s simulated play boundary`, failure => {
      const { engine, state, decklists } = fixture(side);
      const failing: Engine = { ...engine, apply(current, actor, move, source, observe) {
        if (current !== state && current.version > state.version && current.turn.phase === "night" && move.kind === "pass") {
          if (failure === "error") throw new Error("boundary failure");
          return { state: current, events: [], answers: [], bounded: [] };
        }
        return engine.apply(current, actor, move, source, observe);
      }, ...(failure === "non-settling" ? { decision: (current: BattleState) => current.version > state.version && current.turn.phase === "night" ? { kind: "respond" as const, side } : engine.decision(current) } : {}) };
      const input = request(engine, state, side, decklists), before = JSON.stringify(input);
      expect(runPolicy(failing, input).choice).toEqual({ kind: "action", action: { kind: "pass" } });
      expect(JSON.stringify(input)).toBe(before);
    });
  }
});
