/**
 * Loop detection after each committed step (rules § Infinite Loops). The
 * runner calls `trackLoops` and `checkMandatoryCycle`; the `repeatLoop` and
 * `loopIteration` steps manage the tracker themselves.
 *
 * - **Optional loops.** Within one acting side's main window of one turn,
 *   the tracker keeps a history: each checkpoint (a `main` decision with an
 *   empty stack and trigger queue) with its loop signature and resources,
 *   and each top-level action with every step and answer it ran. When a
 *   checkpoint's signature equals an earlier one's and the resources between
 *   them gained something for the actor and nothing for the opponent, the
 *   actions between them become the loop on offer.
 * - **Mandatory cycles.** Once a run of automatic steps with no decision
 *   offered reaches the battle's check threshold, the full state is hashed
 *   after each step and compared with the hash saved at the last power-of-two
 *   step count (Brent's cycle detection): an exact repeat is found within a
 *   few cycle lengths of the threshold, with constant memory.
 */
import { mainWindowSide } from "../rules/decision";
import { endBattle } from "../rules/victory";
import type { Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { Step } from "../steps/kinds";
import type { RecordedAnswer, StepContext } from "../steps/types";
import { cycleHash, gainsFor, loopResources, loopSignature } from "./signature";
import type { LoopCandidate, LoopCheckpoint, LoopId, LoopScope, LoopTracker } from "./types";

/** The side deciding at a checkpoint, or `null` when `state` is not one. */
export function checkpointSide(state: BattleState): Side | null {
  if (state.result !== null || state.stack.length > 0 || state.triggerQueue.length > 0 || state.loops.run !== null) {
    return null;
  }
  return mainWindowSide(state);
}

function scopeAt(state: BattleState, side: Side): LoopScope {
  return { turn: state.turn.turnNumber, phase: state.turn.phase, side };
}

function sameScope(a: LoopScope | null, b: LoopScope): boolean {
  return a !== null && a.turn === b.turn && a.phase === b.phase && a.side === b.side;
}

function checkpointOf(state: BattleState, action: number): LoopCheckpoint {
  return { signature: loopSignature(state), resources: loopResources(state), action };
}

function clearHistory(loops: LoopTracker): void {
  loops.scope = null;
  loops.checkpoints = [];
  loops.actions = [];
}

/** Starts a new history at `state` when it is a checkpoint, else keeps none. */
export function restartHistory(state: BattleState): void {
  const { loops } = state;
  const side = checkpointSide(state);
  if (side === null) {
    clearHistory(loops);
    return;
  }
  loops.scope = scopeAt(state, side);
  loops.checkpoints = [checkpointOf(state, 0)];
  loops.actions = [];
}

/**
 * Keeps the history within `limit` actions (the battle data module): the oldest
 * checkpoints, and the actions before the first one kept, are dropped.
 */
function trimHistory(loops: LoopTracker, limit: number): void {
  const excess = loops.actions.length - limit;
  if (excess <= 0) return;
  const first = loops.checkpoints.findIndex((checkpoint) => checkpoint.action >= excess);
  if (first < 0) {
    clearHistory(loops);
    return;
  }
  const base = loops.checkpoints[first]?.action ?? 0;
  loops.checkpoints = loops.checkpoints.slice(first).map((checkpoint) => ({ ...checkpoint, action: checkpoint.action - base }));
  loops.actions = loops.actions.slice(base);
}

/** Whether a side other than the actor made a real choice: an answer that was not forced. */
function contested(answers: readonly RecordedAnswer[], choosers: readonly Side[], actor: Side): boolean {
  return answers.some((answer, index) => answer.auto !== true && choosers[index] !== actor);
}

/**
 * The loop candidate the latest checkpoint completes: from the latest earlier
 * checkpoint it repeats with a gain for `side`.
 */
function findCandidate(loops: LoopTracker, side: Side): LoopCandidate | null {
  const checkpoint = loops.checkpoints[loops.checkpoints.length - 1];
  if (checkpoint === undefined) return null;
  for (let index = loops.checkpoints.length - 2; index >= 0; index--) {
    const earlier = loops.checkpoints[index];
    if (earlier === undefined || earlier.signature !== checkpoint.signature || earlier.action === checkpoint.action) continue;
    if (!gainsFor(side, earlier.resources, checkpoint.resources)) continue;
    const id: LoopId = `l${loops.nextLoop}`;
    loops.nextLoop += 1;
    return { id, side, signature: checkpoint.signature, actions: loops.actions.slice(earlier.action) };
  }
  return null;
}

/**
 * Records a committed step in the history of `work.loops` and updates the
 * loop on offer. `start` is the state the step ran from; `choosers` names the
 * side that gave each answer.
 */
export function trackLoops(
  start: BattleState,
  work: BattleState,
  step: Step,
  answers: readonly RecordedAnswer[],
  choosers: readonly Side[],
  automatic: boolean,
): void {
  if (step.kind === "repeatLoop" || step.kind === "loopIteration") return;
  const { loops } = work;
  if (!automatic) {
    const at = checkpointSide(start);
    if (at !== null) {
      const scope = scopeAt(start, at);
      const recorded = sameScope(loops.scope, scope) && loops.checkpoints[loops.checkpoints.length - 1]?.action === loops.actions.length;
      if (!recorded) {
        if (!sameScope(loops.scope, scope)) clearHistory(loops);
        loops.scope = scope;
        loops.checkpoints.push(checkpointOf(start, loops.actions.length));
      }
    } else {
      // A response: it extends the history only when the history's actor makes it.
      const actor = start.priority;
      if (actor === null || loops.scope === null || !sameScope(loops.scope, scopeAt(start, actor))) clearHistory(loops);
    }
    if (loops.scope !== null) {
      if (contested(answers, choosers, loops.scope.side)) clearHistory(loops);
      else loops.actions.push({ steps: [{ step, answers }] });
    }
  } else if (loops.scope !== null) {
    const last = loops.actions[loops.actions.length - 1];
    if (last !== undefined) {
      if (contested(answers, choosers, loops.scope.side)) clearHistory(loops);
      else loops.actions[loops.actions.length - 1] = { steps: [...last.steps, { step, answers }] };
    }
  }
  const side = checkpointSide(work);
  if (side === null) {
    loops.candidate = null;
    return;
  }
  const scope = scopeAt(work, side);
  if (!sameScope(loops.scope, scope)) {
    loops.scope = scope;
    loops.checkpoints = [checkpointOf(work, 0)];
    loops.actions = [];
    loops.candidate = null;
    return;
  }
  loops.checkpoints.push(checkpointOf(work, loops.actions.length));
  trimHistory(loops, work.config.loopHistoryActions);
  loops.candidate = findCandidate(loops, side);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/**
 * Ends the battle in a draw when automatic steps return it to exactly a
 * state they passed through (rules § Mandatory Loops), checked from the
 * battle's `mandatoryLoopCheckFrom` step of a run on. `automatic` is false
 * for a step that follows or replays a decision, which starts a new run.
 */
export function checkMandatoryCycle(ctx: StepContext, automatic: boolean): void {
  const { state } = ctx;
  if (!automatic) {
    state.loops.cycleMark = null;
    return;
  }
  if (state.result !== null || state.automaticSteps < state.config.mandatoryLoopCheckFrom) return;
  const hash = cycleHash(state);
  if (hash === state.loops.cycleMark) {
    endBattle(ctx, { kind: "draw", reason: "mandatoryLoop" });
    return;
  }
  if (isPowerOfTwo(state.automaticSteps)) state.loops.cycleMark = hash;
}
