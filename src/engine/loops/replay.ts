/**
 * One iteration of an accepted loop (rules § Optional Loops): the loop's
 * recorded steps run again in order, each from the previous one's committed
 * result, answering every prompt from the recording.
 *
 * The iteration stops early, keeping the last state it reached at a step
 * boundary:
 *
 * - **illegalAction:** a recorded top-level action is no longer legal;
 * - **opponentDecision:** the opponent holds a decision with a legal
 *   response other than passing;
 * - **changedChoice:** a replayed prompt has a different fingerprint, or a
 *   prompt is added or dropped; the step is discarded, so a top-level action
 *   is left to its player and an automatic step runs on and asks;
 * - **battleEnded:** the battle ended;
 * - **diverged:** a different automatic step comes next, or the iteration
 *   ends at a position other than the loop's checkpoint.
 */
import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import { allowedBy } from "../rules/actions";
import { decision, legalActions } from "../rules/decision";
import { createLegalityMemo } from "../rules/legality";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { actionForStep, nextAutomaticStep, stepForAction } from "../steps/driver";
import { IllegalAnswer, ReplayDivergence, UnrecordedPrompt } from "../steps/errors";
import type { Step } from "../steps/kinds";
import { runStep } from "../steps/runner";
import { NO_PROMPTS } from "../steps/sources";
import { loopSignature } from "./signature";
import { checkpointSide } from "./tracker";
import type { LoopCandidate, LoopEndReason, LoopStep } from "./types";

export interface IterationOutcome {
  /** The state after the last step that ran to completion. */
  readonly state: BattleState;
  readonly events: readonly EngineEvent[];
  /** Why the iteration stopped early, or `null` when it completed. */
  readonly stop: LoopEndReason | null;
}

function sameStep(a: Step, b: Step): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Replays one recorded step; `null` when its prompts differ from the recording. */
function replayStep(start: BattleState, recorded: LoopStep, automatic: boolean, catalog: EngineCatalog) {
  try {
    const result = runStep(start, recorded.step, NO_PROMPTS, catalog, { prefix: recorded.answers, automatic, replay: true });
    return result.kind === "done" && result.answers.length === recorded.answers.length ? result : null;
  } catch (error) {
    if (error instanceof ReplayDivergence || error instanceof UnrecordedPrompt || error instanceof IllegalAnswer) return null;
    throw error;
  }
}

/** Runs one iteration of `candidate` from `start`, a checkpoint equivalent to the loop's. */
export function replayIteration(start: BattleState, candidate: LoopCandidate, catalog: EngineCatalog): IterationOutcome {
  const memo = createLegalityMemo();
  const actor = candidate.side;
  const events: EngineEvent[] = [];
  // The replayed steps see the battle as their player saw it, with no repetition running.
  let state: BattleState = { ...start, loops: { ...start.loops, run: null } };
  const stopped = (stop: LoopEndReason): IterationOutcome => ({ state, events, stop });
  /** Why the run cannot go on at a decision boundary that is not the actor's next action. */
  const atDecision = (): LoopEndReason => (decision(state, catalog, memo)?.side === opponent(actor) ? "opponentDecision" : "diverged");
  for (const recorded of candidate.actions) {
    const [first] = recorded.steps;
    const action = first === undefined ? null : actionForStep(first.step);
    if (first === undefined || action === null) return stopped("diverged");
    if (decision(state, catalog, memo)?.side !== actor) return stopped(atDecision());
    if (
      !legalActions(state, catalog, actor, memo).some((legal) => allowedBy(legal, action, state)) ||
      !sameStep(stepForAction(state, action), first.step)
    ) {
      return stopped("illegalAction");
    }
    for (const [index, step] of recorded.steps.entries()) {
      if (index > 0) {
        const next = nextAutomaticStep(state, catalog, memo);
        if (next === null) return stopped(atDecision());
        if (!sameStep(next, step.step)) return stopped("diverged");
      }
      const result = replayStep(state, step, index > 0, catalog);
      if (result === null) return stopped("changedChoice");
      state = result.state;
      events.push(...result.events);
      if (state.result !== null) return stopped("battleEnded");
    }
    // The recorded action ran until a top-level decision.
    if (nextAutomaticStep(state, catalog, memo) !== null) return stopped("diverged");
  }
  if (checkpointSide(state) !== actor || loopSignature(state) !== candidate.signature) return stopped("diverged");
  return { state, events, stop: null };
}
