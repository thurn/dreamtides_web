import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import type { Action } from "../rules/actions";
import { decision, mainWindowSide } from "../rules/decision";
import { legalMoves, type BoundedLegality, type LegalityMemo } from "../rules/legality";
import type { BattleState } from "../state/types";
import type { Step } from "./kinds";
import { runStep } from "./runner";
import type { AnswerSource, RecordedAnswer } from "./types";

/** Called after every committed step, with the step that produced the state. */
export type StepObserver = (state: BattleState, step: Step, events: readonly EngineEvent[]) => void;

/** The step a top-level action runs. */
export function stepForAction(state: BattleState, action: Action): Step {
  switch (action.kind) {
    case "play":
      return { kind: "play", card: action.card, from: action.from, ...(action.slot === undefined ? {} : { slot: action.slot }) };
    case "activate":
      return { kind: "activate", source: action.source, ability: action.ability };
    case "payToEnd":
      return { kind: "payToEnd", effect: action.effect };
    case "reposition":
      return { kind: "reposition", card: action.card, to: action.to };
    case "pass":
      return state.stack.length > 0 ? { kind: "resolveTop" } : { kind: "advancePhase" };
    case "repeatLoop":
      return { kind: "repeatLoop", loop: action.loop, count: action.count };
  }
}

/**
 * The top-level action a step taken as one ran, the inverse of
 * `stepForAction`: a top-level `resolveTop` or `advancePhase` is a pass.
 * `null` for a step no action runs.
 */
export function actionForStep(step: Step): Action | null {
  switch (step.kind) {
    case "play":
      return { kind: "play", card: step.card, from: step.from, ...(step.slot === undefined ? {} : { slot: step.slot }) };
    case "activate":
      return { kind: "activate", source: step.source, ability: step.ability };
    case "payToEnd":
      return { kind: "payToEnd", effect: step.effect };
    case "reposition":
      return { kind: "reposition", card: step.card, to: step.to };
    case "resolveTop":
    case "advancePhase":
      return { kind: "pass" };
    case "repeatLoop":
      return { kind: "repeatLoop", loop: step.loop, count: step.count };
    case "beginBattle":
    case "challengeLane":
    case "resolveTrigger":
    case "loopIteration":
      return null;
  }
}

/**
 * The next automatic step, or `null` when a top-level decision is pending or
 * the battle has ended. Automatic steps are: the iterations of an accepted
 * loop; draining the trigger queue, one trigger per step (D14); auto-pass for
 * a side with no legal response (P1); phases that advance on their own; and
 * challenge lanes.
 */
export function nextAutomaticStep(
  state: BattleState,
  catalog: EngineCatalog,
  memo: LegalityMemo,
): Step | null {
  if (state.result !== null) {
    return null;
  }
  if (state.loops.run !== null) {
    return { kind: "loopIteration" };
  }
  if (state.triggerQueue.length > 0) {
    return { kind: "resolveTrigger" };
  }
  if (decision(state, catalog, memo) !== null) {
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

/**
 * The plays and activations a committed state's decision leaves out because
 * their legality search spent its budget: the priority holder's responses on
 * a non-empty stack, which decide whether it passes automatically, and,
 * where play `stopped` for a decision, the main window's options.
 */
export function boundedLegality(
  state: BattleState,
  catalog: EngineCatalog,
  memo: LegalityMemo,
  stopped: boolean,
): BoundedLegality[] {
  if (state.result !== null || state.triggerQueue.length > 0 || state.loops.run !== null) return [];
  const side = state.stack.length > 0 ? state.priority : stopped ? mainWindowSide(state) : null;
  if (side === null) return [];
  return legalMoves(state, catalog, side, memo).bounded.map((step) => ({ version: state.version, side, step }));
}

/**
 * Runs `step`, then automatic steps until a top-level decision or a result,
 * answering prompts inline. Returns the final state, every event, every
 * answer given, and every play or activation a decision on the way left out
 * unproven (`boundedLegality`), in order.
 */
export function runToDecision(
  start: BattleState,
  step: Step,
  source: AnswerSource,
  catalog: EngineCatalog,
  memo: LegalityMemo,
  observe?: StepObserver,
  automatic = false,
): { state: BattleState; events: EngineEvent[]; answers: RecordedAnswer[]; bounded: BoundedLegality[] } {
  const events: EngineEvent[] = [];
  const answers: RecordedAnswer[] = [];
  const bounded: BoundedLegality[] = [];
  let current: Step | null = step;
  let isAutomatic = automatic;
  let state = start;
  while (current !== null) {
    const result = runStep(state, current, source, catalog, { automatic: isAutomatic, searches: memo.searches });
    if (result.kind === "suspended") {
      throw new Error("An inline run cannot suspend; use the fold for interactive play");
    }
    state = result.state;
    events.push(...result.events);
    answers.push(...result.answers);
    observe?.(state, current, result.events);
    current = nextAutomaticStep(state, catalog, memo);
    bounded.push(...boundedLegality(state, catalog, memo, current === null));
    isAutomatic = true;
  }
  return { state, events, answers, bounded };
}
