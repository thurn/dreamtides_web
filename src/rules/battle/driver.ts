// The fold-time effect-queue driver: the pure replacement for the reactive
// `use-*-effect-runner.ts` hooks. It advances a battle's `effectQueue` of
// automation runs, applying deterministic edit steps immediately and parking
// on a `PendingPrompt` when a run needs player input, resuming when the prompt
// resolves. Every function is an immutable-return pure transform of
// `BattleFoldState` — it never mutates its input, so a fold can be retried and
// two clients folding the same (seed, seq) converge byte-for-byte.
//
// CURSOR MODEL (see fold.ts). A run's position is a PATH of indices into the
// static script step tree, not a single top-level index. `planNextEffectStep`
// and `applyPromptResolution` (effect-runner-core.ts) reason over a FLAT
// `EffectStep[]` "remaining" list and PREPEND a `confirm`'s `onYes` steps when
// it resolves affirmatively. The driver bridges the two: it materializes the
// flat "remaining" list from the cursor for those functions, then translates
// their result back into a plain-number cursor. Nested prompts (a prompt inside
// a `confirm.onYes`) are real in the live dreamwell table, so the path cursor
// is required; a top-level `stepIndex` could not address them.

import type { BattleDebugEdit } from "../../battle/debug/commands";
import type { BattleEngineEmissionContext, BattleMutableState } from "../../battle/types";
import type { EventContext } from "../../eventlog/types";
import { applyDebugEdit } from "./apply-debug-edit";
import { applyPromptResolution, planNextEffectStep } from "./effect-runner-core";
import type { PromptResolution } from "./effect-runner-core";
import type { EffectStep, StepContext } from "./effect-step";
import type { BattleFoldState, EffectRun } from "./fold";
import { resolveScript } from "./fold";

const EMISSION: BattleEngineEmissionContext = {
  sourceSurface: "auto-system",
  selectedCardId: null,
};

// ---------------------------------------------------------------------------
// Cursor navigation over the (possibly nested) static step tree
// ---------------------------------------------------------------------------

/**
 * Returns the step list addressed by `path`: the empty path yields the root
 * `steps`; each index descends into the `confirm.onYes` branch of the step at
 * that index. Throws when the path crosses a step that is not a `confirm`
 * prompt — a cursor that cannot address a real branch, meaning an unsupported
 * script shape (the tripwire for a future script the driver can't cursor).
 */
function listAtPath(steps: EffectStep[], path: number[]): EffectStep[] {
  let list = steps;
  for (const index of path) {
    const step = list[index];
    if (step === undefined || step.kind !== "prompt" || step.prompt.kind !== "confirm") {
      throw new Error(
        `driver: cursor path ${JSON.stringify(path)} descends through a non-confirm step`,
      );
    }
    list = step.prompt.onYes;
  }
  return list;
}

/**
 * Flattens the run's remaining steps starting at `cursor`, in execution order,
 * so `planNextEffectStep` / `applyPromptResolution` (which think in flat lists)
 * can consume them. The head is the step AT the cursor; the tail unwinds
 * siblings-after within the current branch, then siblings-after in each
 * ancestor branch. Mirrors how `applyPromptResolution` prepends `onYes`.
 */
function remainingFromCursor(steps: EffectStep[], cursor: number[]): EffectStep[] {
  if (cursor.length === 0) return steps;
  const [head, ...restPath] = cursor;
  if (restPath.length === 0) {
    return steps.slice(head);
  }
  const child = steps[head];
  if (child === undefined || child.kind !== "prompt" || child.prompt.kind !== "confirm") {
    throw new Error(
      `driver: cursor ${JSON.stringify(cursor)} descends through a non-confirm step`,
    );
  }
  return [...remainingFromCursor(child.prompt.onYes, restPath), ...steps.slice(head + 1)];
}

/**
 * In-order successor of `cursor` over the step tree: advance the innermost
 * index; if it runs off the end of its branch, pop up and advance the parent,
 * repeating. Returns `null` when the whole run is exhausted (the run is popped).
 */
function advanceCursor(steps: EffectStep[], cursor: number[]): number[] | null {
  const next = [...cursor];
  while (next.length > 0) {
    const depth = next.length - 1;
    next[depth] += 1;
    const parentList = listAtPath(steps, next.slice(0, depth));
    if (next[depth] < parentList.length) return next;
    next.pop();
  }
  return null;
}

/**
 * The cursor to resume at after a prompt resolves. A `confirm` answered "Yes"
 * (choice index 0) with a non-empty `onYes` DESCENDS into that branch
 * (`[...cursor, 0]`), exactly matching `applyPromptResolution` prepending
 * `onYes`. Every other prompt/answer advances PAST the prompt in place.
 */
function nextCursorAfterPrompt(
  steps: EffectStep[],
  cursor: number[],
  promptStep: Extract<EffectStep, { kind: "prompt" }>,
  resolution: PromptResolution,
): number[] | null {
  const { prompt } = promptStep;
  if (
    prompt.kind === "confirm" &&
    resolution.kind === "choice" &&
    resolution.optionIndex === 0 &&
    prompt.onYes.length > 0
  ) {
    return [...cursor, 0];
  }
  return advanceCursor(steps, cursor);
}

/**
 * Tripwire tying the cursor navigation to `applyPromptResolution`'s
 * authoritative `rest`. Both derive from the same static script objects, so the
 * remaining list the cursor reconstructs must be element-wise reference-equal
 * to the `rest` the resolver returned. A mismatch means the driver cannot
 * address the post-resolution position (a script shape it does not support) —
 * fail loud rather than silently diverge.
 */
function assertCursorMatchesRest(
  steps: EffectStep[],
  nextCursor: number[] | null,
  expectedRest: EffectStep[],
): void {
  const actual = nextCursor === null ? [] : remainingFromCursor(steps, nextCursor);
  const same =
    actual.length === expectedRest.length && actual.every((s, i) => s === expectedRest[i]);
  if (!same) {
    throw new Error(
      "driver: cursor navigation diverged from applyPromptResolution rest — unsupported nested script shape",
    );
  }
}

// ---------------------------------------------------------------------------
// Edit application
// ---------------------------------------------------------------------------

/** Applies each edit in order via `applyDebugEdit`, returning the new board. */
function applyEdits(
  board: BattleMutableState,
  edits: BattleDebugEdit[],
): BattleMutableState {
  let next = board;
  for (const edit of edits) {
    next = applyDebugEdit(next, edit, EMISSION).state;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Queue advance
// ---------------------------------------------------------------------------

/**
 * Core loop shared by both entry points. Drives the queue while no prompt is
 * pending, using the caller-supplied `random`/`nowMs` so a single draw counter
 * spans the whole fold step (RESOLVE_PROMPT continues the same counter after
 * its resolution edits). Returns a fresh `BattleFoldState`.
 */
function runQueue(
  board: BattleMutableState,
  queue: EffectRun[],
  seq: number,
  random: () => number,
  nowMs: number,
): BattleFoldState {
  let currentBoard = board;
  let currentQueue = queue;

  while (currentQueue.length > 0) {
    const run = currentQueue[0];
    const steps = resolveScript(run.scriptRef);
    const remaining = remainingFromCursor(steps, run.cursor);
    const stepCtx: StepContext =
      run.sourceInstanceId === undefined
        ? { side: run.side, state: currentBoard, random, nowMs }
        : { side: run.side, state: currentBoard, random, nowMs, sourceId: run.sourceInstanceId };
    const plan = planNextEffectStep(remaining, stepCtx);

    if (plan.type === "done") {
      currentQueue = currentQueue.slice(1);
      continue;
    }

    if (plan.type === "dispatch") {
      currentBoard = applyEdits(currentBoard, plan.edits);
      const nextCursor = advanceCursor(steps, run.cursor);
      currentQueue =
        nextCursor === null
          ? currentQueue.slice(1)
          : [{ ...run, cursor: nextCursor }, ...currentQueue.slice(1)];
      continue;
    }

    // plan.type === "prompt" — park with the parked cursor and materialized options.
    return {
      board: currentBoard,
      effectQueue: currentQueue,
      pendingPrompt: {
        promptId: seq,
        run,
        kind: plan.prompt.kind,
        options: plan.active,
      },
    };
  }

  return { board: currentBoard, effectQueue: currentQueue, pendingPrompt: null };
}

/** Adapts `ctx.rng` (keyed by seq + drawIndex) into the `() => number` stream
 *  `StepContext.random` expects, with a single counter for the whole advance so
 *  successive draws are independent yet deterministic for (seed, seq). */
function makeRandomStream(ctx: EventContext): () => number {
  let drawIndex = 0;
  return () => ctx.rng(drawIndex++);
}

/**
 * Advances `battle.effectQueue` until it needs input (a `pendingPrompt` is set)
 * or empties, applying deterministic edit steps to the board in place. A no-op
 * when a prompt is already pending. Immutable-return: `battle` is not mutated.
 */
export function advanceEffectQueue(
  battle: BattleFoldState,
  ctx: EventContext,
): BattleFoldState {
  if (battle.pendingPrompt !== null) return battle;
  return runQueue(
    battle.board,
    battle.effectQueue,
    ctx.seq,
    makeRandomStream(ctx),
    Date.parse(ctx.timestamp),
  );
}

/**
 * Resolves the open prompt: applies `applyPromptResolution` for the parked run,
 * applies the resulting edits, translates the resolution into the next cursor
 * (descending into `onYes` on a `confirm` "Yes"), then resumes advancing the
 * queue. Clears `pendingPrompt`. A no-op returning the input when no prompt is
 * pending. Immutable-return.
 */
export function resolvePendingPrompt(
  battle: BattleFoldState,
  resolution: PromptResolution,
  ctx: EventContext,
): BattleFoldState {
  const pending = battle.pendingPrompt;
  if (pending === null) return battle;

  const random = makeRandomStream(ctx);
  const nowMs = Date.parse(ctx.timestamp);

  const run = pending.run;
  const steps = resolveScript(run.scriptRef);
  const remaining = remainingFromCursor(steps, run.cursor);
  const [promptStep, ...rest] = remaining;

  // The cursor no longer addresses a prompt (stale/mismatched) — clear the
  // prompt defensively and resume; the reducer treats an unmatched resolve as a
  // bounce before reaching here in production.
  if (promptStep === undefined || promptStep.kind !== "prompt") {
    return runQueue(battle.board, battle.effectQueue, ctx.seq, random, nowMs);
  }

  const stepCtx: StepContext =
    run.sourceInstanceId === undefined
      ? { side: run.side, state: battle.board, random, nowMs }
      : { side: run.side, state: battle.board, random, nowMs, sourceId: run.sourceInstanceId };

  const { edits, rest: expectedRest } = applyPromptResolution(
    promptStep.prompt,
    resolution,
    rest,
    stepCtx,
  );
  const board = applyEdits(battle.board, edits);

  const nextCursor = nextCursorAfterPrompt(steps, run.cursor, promptStep, resolution);
  assertCursorMatchesRest(steps, nextCursor, expectedRest);

  const queue =
    nextCursor === null
      ? battle.effectQueue.slice(1)
      : [{ ...run, cursor: nextCursor }, ...battle.effectQueue.slice(1)];

  return runQueue(board, queue, ctx.seq, random, nowMs);
}
