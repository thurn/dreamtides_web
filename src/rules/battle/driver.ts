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
import type {
  BattleEngineEmissionContext,
  BattleMutableState,
} from "../../battle/types";
import type { EventContext } from "../../eventlog/types";
import { isoTimestampToMs } from "./timestamp";
import { applyDebugEdit, forceBattleResult } from "./apply-debug-edit";
import { battleTriggerScriptId } from "./battle-card-effects-table";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import { dreamwellEnergyEdits } from "../../battle/engine/energy";
import { applyPromptResolution, planNextEffectStep } from "./effect-runner-core";
import type { PromptResolution } from "./effect-runner-core";
import type { EffectStep, StepContext } from "./effect-step";
import type { BattleFoldState, EffectRun } from "./fold";
import { battleModeOf, newEffectRun, resolveScript } from "./fold";
import { selectBattleCardLocation } from "../../battle/state/selectors";

const EMISSION: BattleEngineEmissionContext = {
  sourceSurface: "auto-system",
  selectedCardId: null,
};

const RUN_QUEUE_STEP_CAP = 10_000;

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

/** Applies each edit in order and schedules lifecycle edges it creates.
 *
 * Effect scripts may dissolve or materialize cards themselves (Flashpoint is
 * the important Starter example). Those moves have the same reducer-owned
 * lifecycle consequences as a direct command, so they must enter the queue at
 * the edit seam rather than being treated as inert implementation details.
 */
function applyEdits(
  board: BattleMutableState,
  edits: BattleDebugEdit[],
  queue?: EffectRun[],
  battle?: BattleFoldState,
): BattleMutableState {
  let next = board;
  for (const edit of edits) {
    if (edit.kind === "DRAW_DREAMWELL_CARD" && battle !== undefined) {
      const dreamwell = battle.init.dreamwellDeck[next.dreamwellDeckIndex];
      for (const energyEdit of dreamwellEnergyEdits(edit.side, next.sides[edit.side].maxEnergy, dreamwell?.energyAdded ?? 0)) {
        next = applyDebugEdit(next, energyEdit, EMISSION).state;
      }
    }
    const before = next;
    next = applyDebugEdit(before, edit, EMISSION).state;
    if (queue !== undefined) {
      scheduleEffectLifecycleEdge(queue, before, next, edit);
      if (edit.kind === "DRAW_DREAMWELL_CARD") {
        const index = next.sides[edit.side].dreamwellCardIndex;
        const dreamwell = index === null ? undefined : battle?.init.dreamwellDeck[index];
        const script = dreamwell === undefined ? null : selectDreamwellEffectScript(dreamwell.id);
        if (dreamwell !== undefined && script !== null && script.steps.length > 0) {
          queue.push(newEffectRun({ table: "dreamwell", id: dreamwell.id }, edit.side));
        }
      }
    }
  }
  return next;
}

function scheduleEffectLifecycleEdge(
  queue: EffectRun[],
  before: BattleMutableState,
  after: BattleMutableState,
  edit: BattleDebugEdit,
): void {
  if (edit.kind === "REMATERIALIZE") {
    const location = selectBattleCardLocation(before, edit.battleCardId);
    if (location !== null && isBattlefieldZone(location.zone)) {
      enqueueLifecycleRun(queue, before, edit.battleCardId, "rematerialized");
    }
    return;
  }
  const battleCardId = edit.kind === "MOVE_CARD_TO_ZONE" ? edit.battleCardId
    : edit.kind === "ABANDON" ? edit.battleCardId
      : null;
  if (battleCardId === null) return;

  const source = selectBattleCardLocation(before, battleCardId);
  const destination = selectBattleCardLocation(after, battleCardId);
  const instance = before.cardInstances[battleCardId];
  if (source === null || destination === null || instance === undefined) return;

  const sourceInPlay = isBattlefieldZone(source.zone);
  const destinationInPlay = isBattlefieldZone(destination.zone);
  if (source.zone === "hand" && instance.definition.battleCardKind === "event") {
    enqueueLifecycleRun(queue, before, battleCardId, "played");
  }
  if (!sourceInPlay && destinationInPlay) {
    enqueueLifecycleRun(queue, before, battleCardId, "materialized");
  }
  // Reclaimed replaces void with banished in applyDebugEdit. Only an observed
  // void edge is dissolution/abandonment, so a replacement never draws or
  // triggers any generic leave-play automation.
  if (sourceInPlay && destination.zone === "void") {
    enqueueLifecycleRun(queue, before, battleCardId, edit.kind === "ABANDON" ? "abandoned" : "dissolved");
  }
}

function enqueueLifecycleRun(
  queue: EffectRun[],
  board: BattleMutableState,
  battleCardId: string,
  trigger: "played" | "materialized" | "rematerialized" | "dissolved" | "abandoned",
): void {
  const instance = board.cardInstances[battleCardId];
  if (instance === undefined) return;
  queue.push(newEffectRun(
    { table: "battle", id: battleTriggerScriptId(instance.definition.cardId, trigger) },
    instance.controller,
    battleCardId,
    {
      trigger,
      sourceCardId: instance.definition.cardId,
      sourceController: instance.controller,
      sourceZone: selectBattleCardLocation(board, battleCardId)?.zone,
    },
  ));
}

function isBattlefieldZone(zone: string): boolean {
  return zone === "backRank" || zone === "frontRank";
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
  battle: BattleFoldState,
  board: BattleMutableState,
  queue: EffectRun[],
  seq: number,
  random: () => number,
  nowMs: number,
  dawnFired: BattleFoldState["dawnFired"],
): BattleFoldState {
  let currentBoard = board;
  let currentQueue = queue;
  let stepsRun = 0;

  while (currentQueue.length > 0) {
    stepsRun += 1;
    if (stepsRun > RUN_QUEUE_STEP_CAP) {
      throw new Error(`runQueue step cap exceeded (${RUN_QUEUE_STEP_CAP})`);
    }
    const run = currentQueue[0];
    const steps = resolveScript(run.scriptRef);
    const remaining = remainingFromCursor(steps, run.cursor);
    const isTutorial = battleModeOf(battle).kind === "tutorial";
    const stepCtx: StepContext =
      run.sourceInstanceId === undefined
        ? { side: run.side, state: currentBoard, random, nowMs, bindings: run.bindings, isTutorial }
        : { side: run.side, state: currentBoard, random, nowMs, sourceId: run.sourceInstanceId, bindings: run.bindings, isTutorial };
    const plan = planNextEffectStep(remaining, stepCtx);

    if (plan.type === "done") {
      currentQueue = currentQueue.slice(1);
      continue;
    }

    if (plan.type === "dispatch") {
      currentBoard = applyEdits(currentBoard, plan.edits, currentQueue, battle);
      const terminal = scoreTerminalResult(battle, currentBoard);
      if (terminal !== null) {
        currentBoard = forceBattleResult(currentBoard, terminal, EMISSION).state;
        return { ...battle, board: currentBoard, effectQueue: [], pendingPrompt: null, dawnFired };
      }
      const nextCursor = advanceCursor(steps, run.cursor);
      currentQueue =
        nextCursor === null
          ? currentQueue.slice(1)
          : [{ ...run, cursor: nextCursor }, ...currentQueue.slice(1)];
      continue;
    }

    // A pick with no legal candidates has only one possible resolution. Apply
    // that empty resolution inside the opening event and keep draining instead
    // of publishing a prompt that blocks every battle interaction until a
    // client explicitly submits zero cards.
    if (
      plan.active.kind === "pick-cards" &&
      plan.active.candidateIds.length === 0
    ) {
      const promptStep = remaining[0];
      if (promptStep === undefined || promptStep.kind !== "prompt") {
        throw new Error("driver: pick-cards plan does not point at a prompt step");
      }
      const resolution: PromptResolution = {
        kind: "pick-cards",
        chosenIds: [],
      };
      const { edits, rest: expectedRest } = applyPromptResolution(
        promptStep.prompt,
        resolution,
        plan.rest,
        stepCtx,
      );
      currentBoard = applyEdits(currentBoard, edits, currentQueue, battle);
      const terminal = scoreTerminalResult(battle, currentBoard);
      if (terminal !== null) {
        currentBoard = forceBattleResult(currentBoard, terminal, EMISSION).state;
        return { ...battle, board: currentBoard, effectQueue: [], pendingPrompt: null, dawnFired };
      }
      const nextCursor = nextCursorAfterPrompt(
        steps,
        run.cursor,
        promptStep,
        resolution,
      );
      assertCursorMatchesRest(steps, nextCursor, expectedRest);
      currentQueue = nextCursor === null
        ? currentQueue.slice(1)
        : [{ ...run, cursor: nextCursor }, ...currentQueue.slice(1)];
      continue;
    }

    // plan.type === "prompt" — park with the parked cursor and materialized
    // options. Foresee's initial reveal belongs to the event that opens the
    // prompt, so mounting its presentation on any number of clients is inert.
    if (plan.active.kind === "foresee") {
      currentBoard = applyDebugEdit(
        currentBoard,
        {
          kind: "REVEAL_DECK_TOP",
          side: run.side,
          count: plan.active.count,
          viewer: run.side,
        },
        EMISSION,
      ).state;
    }
    return {
      ...battle,
      board: currentBoard,
      effectQueue: currentQueue,
      pendingPrompt: {
        promptId: seq,
        run,
        kind: plan.prompt.kind,
        options: plan.active,
      },
      dawnFired,
    };
  }

  return {
    ...battle,
    board: currentBoard,
    effectQueue: currentQueue,
    pendingPrompt: null,
    dawnFired,
  };
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
  return advanceEffectQueueWithStream(
    battle,
    ctx.seq,
    makeRandomStream(ctx),
    isoTimestampToMs(ctx.timestamp) ?? 0,
  );
}

/**
 * The stream-driven form of {@link advanceEffectQueue}: the caller supplies the
 * `random`/`nowMs` directly rather than an `EventContext`, so a SINGLE mutable
 * draw counter can thread across several commands folded in one event (a
 * `BATTLE_GESTURE`) without two commands colliding on the same rng index. A
 * no-op when a prompt is already pending. Immutable-return.
 */
export function advanceEffectQueueWithStream(
  battle: BattleFoldState,
  seq: number,
  random: () => number,
  nowMs: number,
): BattleFoldState {
  if (battle.pendingPrompt !== null) return battle;
  return runQueue(
    battle,
    battle.board,
    battle.effectQueue,
    seq,
    random,
    nowMs,
    battle.dawnFired,
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
  return resolvePendingPromptWithStream(
    battle,
    resolution,
    ctx.seq,
    makeRandomStream(ctx),
    isoTimestampToMs(ctx.timestamp) ?? 0,
  );
}

/**
 * The stream-driven form of {@link resolvePendingPrompt}: the caller supplies
 * the `seq`/`random`/`nowMs` directly so the resolution's draws continue the
 * same counter a caller may use for a follow-on step (e.g. the post-drain
 * support recompute). Immutable-return.
 */
export function resolvePendingPromptWithStream(
  battle: BattleFoldState,
  resolution: PromptResolution,
  seq: number,
  random: () => number,
  nowMs: number,
): BattleFoldState {
  const pending = battle.pendingPrompt;
  if (pending === null) return battle;

  const run = pending.run;
  const steps = resolveScript(run.scriptRef);
  const remaining = remainingFromCursor(steps, run.cursor);
  const [promptStep, ...rest] = remaining;

  // The cursor addresses a stale or mismatched prompt — clear the
  // prompt defensively and resume; the reducer treats an unmatched resolve as a
  // bounce before reaching here in production.
  if (promptStep === undefined || promptStep.kind !== "prompt") {
    return runQueue(
      battle,
      battle.board,
      battle.effectQueue,
      seq,
      random,
      nowMs,
      battle.dawnFired,
    );
  }

  const isTutorial = battleModeOf(battle).kind === "tutorial";
  const stepCtx: StepContext =
    run.sourceInstanceId === undefined
      ? { side: run.side, state: battle.board, random, nowMs, bindings: run.bindings, promptCandidateIds: pending.options.kind === "pick-cards" ? pending.options.candidateIds : undefined, isTutorial }
      : { side: run.side, state: battle.board, random, nowMs, sourceId: run.sourceInstanceId, bindings: run.bindings, promptCandidateIds: pending.options.kind === "pick-cards" ? pending.options.candidateIds : undefined, isTutorial };

  const { edits, rest: expectedRest } = applyPromptResolution(
    promptStep.prompt,
    resolution,
    rest,
    stepCtx,
  );
  const nextCursor = nextCursorAfterPrompt(steps, run.cursor, promptStep, resolution);
  assertCursorMatchesRest(steps, nextCursor, expectedRest);
  const advancedQueue =
    nextCursor === null
      ? battle.effectQueue.slice(1)
      : [{ ...run, cursor: nextCursor }, ...battle.effectQueue.slice(1)];
  const board = applyEdits(battle.board, edits, advancedQueue, battle);
  const terminal = scoreTerminalResult(battle, board);
  if (terminal !== null) {
    return {
      ...battle,
      board: forceBattleResult(board, terminal, EMISSION).state,
      effectQueue: [],
      pendingPrompt: null,
    };
  }

  return runQueue(
    battle,
    board,
    advancedQueue,
    seq,
    random,
    nowMs,
    battle.dawnFired,
  );
}

/** Central score policy shared by every effect dispatch and prompt resolution. */
function scoreTerminalResult(
  battle: BattleFoldState,
  board: BattleMutableState,
): "victory" | "defeat" | null {
  if (board.result !== null) return null;
  if (board.sides.player.score >= battle.init.scoreToWin) return "victory";
  if (battleModeOf(battle).kind === "journey" && board.sides.enemy.score >= battle.init.scoreToWin) {
    return "defeat";
  }
  return null;
}
