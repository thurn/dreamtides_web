import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import type { Action } from "../rules/actions";
import { decision } from "../rules/decision";
import { endBattle } from "../rules/victory";
import type { BattleState } from "../state/types";
import { Context } from "./context";
import type { Step } from "./kinds";
import { runStep } from "./runner";
import type { AnswerSource } from "./types";

/** Called after every committed step, with the step that produced the state. */
export type StepObserver = (state: BattleState, step: Step, events: readonly EngineEvent[]) => void;

/** The step a top-level action runs. */
export function stepForAction(state: BattleState, action: Action): Step {
  switch (action.kind) {
    case "play":
      return { kind: "play", card: action.card };
    case "reposition":
      return { kind: "reposition", card: action.card, to: action.to };
    case "pass":
      return state.stack.length > 0 ? { kind: "resolveTop" } : { kind: "advancePhase" };
  }
}

/**
 * The next automatic step, or `null` when a top-level decision is pending or
 * the battle has ended. Automatic steps are: auto-pass for a side with no
 * legal response (P1), phases that advance on their own, and challenge lanes.
 */
export function nextAutomaticStep(state: BattleState, catalog: EngineCatalog): Step | null {
  if (state.result !== null || decision(state, catalog) !== null) {
    return null;
  }
  if (state.stack.length > 0) {
    return { kind: "resolveTop" };
  }
  switch (state.turn.phase) {
    case "dreamwell":
    case "draw":
    case "dawn":
    case "ending":
      return { kind: "advancePhase" };
    case "challenge":
      return state.turn.challengeLane === null
        ? { kind: "advancePhase" }
        : { kind: "challengeLane", lane: state.turn.challengeLane };
    default:
      return null;
  }
}

/** Ends the battle as a draw once automatic steps run past the resolution cap. */
function capReached(state: BattleState, catalog: EngineCatalog, source: AnswerSource): BattleState {
  const ctx = new Context(state, catalog, source);
  endBattle(ctx, { kind: "draw", reason: "resolutionCap" });
  return state;
}

/**
 * Runs `step`, then automatic steps until a top-level decision or a result.
 * Returns the final state and every event, in order.
 */
export function runToDecision(
  start: BattleState,
  step: Step,
  source: AnswerSource,
  catalog: EngineCatalog,
  observe?: StepObserver,
): { state: BattleState; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  let result = runStep(start, step, source, catalog);
  let state = result.state;
  events.push(...result.events);
  observe?.(state, step, result.events);
  state.automaticSteps = 0;
  for (;;) {
    const next = nextAutomaticStep(state, catalog);
    if (next === null) {
      return { state, events };
    }
    if (state.automaticSteps >= state.config.resolutionCap) {
      state = capReached(state, catalog, source);
      return { state, events };
    }
    result = runStep(state, next, source, catalog);
    state = result.state;
    state.automaticSteps += 1;
    events.push(...result.events);
    observe?.(state, next, result.events);
  }
}
