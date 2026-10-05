/**
 * The scenario-spec builder: a board, top-level actions, and scripted prompt
 * answers, run through the engine. Primitive tests and Phase 5 content specs
 * share it.
 */
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import type { Answer } from "../prompts/types";
import type { Action } from "../rules/actions";
import type { Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { boardState, type BoardSetup } from "./board";

export type BoardIds = ReturnType<typeof boardState>["ids"];

export interface ScenarioStep {
  readonly side: Side;
  readonly action: Action;
}

export interface ScenarioSpec {
  readonly board: BoardSetup;
  /** Top-level actions in order; they may refer to the placed instance IDs. */
  readonly steps: (ids: BoardIds) => readonly ScenarioStep[];
  /** Answers to every non-automatic prompt, in order across all steps. */
  readonly answers?: (ids: BoardIds) => readonly Answer[];
}

export interface ScenarioResult {
  readonly start: BattleState;
  readonly state: BattleState;
  readonly events: readonly EngineEvent[];
  readonly answers: readonly RecordedAnswer[];
  readonly ids: BoardIds;
}

/** Runs a scenario; fails if a prompt has no scripted answer or answers are left over. */
export function runScenario(engine: Engine, spec: ScenarioSpec): ScenarioResult {
  const { state: start, ids } = boardState(engine.catalog, spec.board);
  const source = new ScriptedSource(spec.answers?.(ids) ?? []);
  let state = start;
  const events: EngineEvent[] = [];
  const answers: RecordedAnswer[] = [];
  for (const step of spec.steps(ids)) {
    const result = engine.apply(state, step.side, step.action, source);
    state = result.state;
    events.push(...result.events);
    answers.push(...result.answers);
  }
  source.assertExhausted();
  return { start, state, events, answers, ids };
}

/** The `play` action for the n-th card placed in `side`'s hand. */
export function playFromHand(ids: BoardIds, side: Side, index = 0): ScenarioStep {
  const card = ids[side].hand[index];
  if (card === undefined) throw new Error(`No hand card ${String(index)} for ${side}`);
  return { side, action: { kind: "play", card, from: "hand" } };
}
