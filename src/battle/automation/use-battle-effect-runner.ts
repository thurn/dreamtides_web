import { useCallback, useEffect, useRef, useState } from "react";
import { createBattleLogBaseFields, logEvent } from "../../logging";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleCardInstance, BattleMutableState, BattleSide } from "../types";
import { rankSlotIds } from "../types";
import type { EffectPrompt, EffectStep, StepContext } from "./effect-step";
import { alliesInPlay } from "./effect-step";
import {
  dawnScriptIsInteractive,
  planSupportRecompute,
  selectBattleCardEffectScript,
} from "./battle-card-effects-table";
import { applyPromptResolution, planNextEffectStep } from "./effect-runner-core";
import type { ActivePrompt, PromptResolution } from "./effect-runner-core";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BattleEffectRunnerArgs {
  enabled: boolean; // isBasicAutomationEnabled
  state: BattleMutableState; // reducerState.mutable (live, per-render)
  dispatchEdit: (edit: BattleDebugEdit) => void; // bypasses planBasicAutomationCommands
  /**
   * Whether this client is the single battle authority. A scripted ▸Materialized
   * / ▸Dawn step's edits are authority mutations that must apply exactly once,
   * but in a shared room every connected client runs this runner off the synced
   * board, so without a gate each automatic edit would be dispatched once per
   * client (two clients ⇒ a ▸Materialized "draw a card" draws twice). The primary
   * client owns a run from the start; ownership transfers to whichever client
   * resolves a prompt (see `resolvePrompt`), because only the resolver keeps
   * walking the run while the partner's overlay is torn down by
   * `cancelPromptSignal`. Single-player has one primary client, so it is
   * unaffected. The idempotent Support recompute is likewise gated so only the
   * authority writes its `SET_CARD_STATIC_SPARK_BONUS` edits.
   */
  isPrimaryClient: boolean;
  /**
   * A monotonic counter that increments whenever a coop partner advances the
   * shared battle (see `remoteCommandEpoch` in the multiplayer context). When it
   * changes while a prompt is open, the partner has resolved that choice on
   * their client, so we tear down the active run and pending queue and dismiss
   * the overlay. Stays constant (and so is inert) in single-player.
   */
  cancelPromptSignal: number;
}

export interface BattleEffectRunnerResult {
  activePrompt: ActivePrompt | null;
  activePromptSide: BattleSide | null; // for the foresee overlay + card rendering
  resolvePrompt: (resolution: PromptResolution) => void;
}

/** A scripted run waiting to be (or currently being) walked through the shared
 *  step queue. Both ▸Materialized board-diffs and interactive ▸Dawn scans feed
 *  the SAME queue; `trigger` records which one so logging faithfully
 *  reconstructs what fired. `battleCardId` is the unique in-play instance id;
 *  `cardId` is its definition UUID (for logging and lookup); `side` is the
 *  controller; `steps` is the remaining queue to walk. */
interface EffectRun {
  battleCardId: string;
  cardId: string;
  side: BattleSide;
  trigger: "materialized" | "dawn";
  steps: EffectStep[];
}

// ---------------------------------------------------------------------------
// Pure detection helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * The edits a freshly-materialized character contributes when automation
 * resolves its ▸Materialized trigger. If `instance.definition.cardId` has a
 * registered `"materialized"` script, runs each edits-step `build(ctx)` and
 * concatenates them in order, with `ctx.side = instance.controller`. Any
 * non-edits step is skipped defensively with a `console.warn` (a prompt step in
 * a materialized script is walked through the runner's step queue instead — this
 * flatten helper is retained only for direct edits-only inspection/testing).
 * Returns `[]` when no materialized script applies.
 */
export function materializedScriptEdits(
  instance: BattleCardInstance,
  state: BattleMutableState,
  nowMs: number,
): BattleDebugEdit[] {
  const script = selectBattleCardEffectScript(instance.definition.cardId);
  if (script === null || script.trigger !== "materialized" || script.steps === undefined) {
    return [];
  }
  const ctx: StepContext = { side: instance.controller, state, random: Math.random, nowMs };
  const edits: BattleDebugEdit[] = [];
  for (const step of script.steps) {
    if (step.kind === "edits") {
      edits.push(...step.build(ctx));
    } else {
      console.warn(
        `materializedScriptEdits: skipping non-edits step kind "${step.kind}" for card ${instance.definition.cardId}`,
      );
    }
  }
  return edits;
}

/**
 * All non-null front- and back-rank occupant ids, both sides. This is the
 * "in-play" set the materialized board-diff tracks: an id that newly appears in
 * this set has just entered play and is eligible to fire its ▸Materialized
 * trigger once.
 */
export function inPlayInstanceIds(state: BattleMutableState): string[] {
  const ids: string[] = [];
  for (const side of ["player", "enemy"] as const) {
    for (const slotId of rankSlotIds(state.sides[side].backRank)) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) ids.push(id);
    }
    for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) ids.push(id);
    }
  }
  return ids;
}

/**
 * Collects the pending materialized runs for the ids that newly appeared in the
 * in-play set since `previous`. For each newly-appeared id whose backing
 * instance's card has a registered non-empty `"materialized"` script, returns an
 * `EffectRun` carrying a fresh copy of that script's steps. Ids already in
 * `previous`, ids with no backing instance, and ids whose card has no
 * materialized script are skipped. Iteration follows `inPlayIds` order so the
 * resulting queue is deterministic.
 */
export function collectNewlyMaterializedRuns(
  inPlayIds: string[],
  previous: Set<string>,
  state: BattleMutableState,
): EffectRun[] {
  const runs: EffectRun[] = [];
  for (const id of inPlayIds) {
    if (previous.has(id)) continue;
    const instance = state.cardInstances[id];
    if (instance === undefined) continue;
    const script = selectBattleCardEffectScript(instance.definition.cardId);
    if (script === null || script.trigger !== "materialized" || script.steps === undefined) {
      continue;
    }
    if (script.steps.length === 0) continue;
    runs.push({
      battleCardId: id,
      cardId: instance.definition.cardId,
      side: instance.controller,
      trigger: "materialized",
      steps: [...script.steps],
    });
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Interactive-Dawn detection (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Phases that have already passed the Dawn bookend for the active side this
 * turn. Under automation React never commits a `phase === "dawn"` render, so we
 * detect "Dawn already happened" by observing the board once the phase has
 * advanced to one of these. Earlier phases (`dreamwell`/`draw`/`dawn`) mean Dawn
 * has not yet resolved, so the interactive scan must NOT fire.
 */
export const POST_DAWN_PHASES = new Set<string>(["day", "dusk", "night", "challenge"]);

/**
 * Whether the interactive-Dawn scan should run for the current `(phase,
 * turnNumber)`. True only once Dawn has passed (`phase ∈ POST_DAWN_PHASES`) and
 * on a turn that has a Dawn (`turnNumber > 1`; turn 1's Dawn is skipped by the
 * rules). The hook additionally gates on a per-(side, turn) processed key so the
 * scan fires at most once per side per turn — this predicate covers only the
 * phase/turn eligibility, which is the part with the interesting bug classes
 * (fires too early / on turn 1).
 */
export function shouldScanInteractiveDawn(phase: string, turnNumber: number): boolean {
  return turnNumber > 1 && POST_DAWN_PHASES.has(phase);
}

/**
 * The interactive-Dawn runs for `side`'s in-play characters whose registered
 * `"dawn"` script is interactive (has a prompt step). Returns `[]` when
 * `alreadyProcessed` is true (this `(side, turn)` was already scanned), so the
 * caller can pass the result of its processed-set check to enforce
 * fire-at-most-once. Each run carries a fresh copy of the script's steps and
 * `trigger: "dawn"`. Iteration follows `alliesInPlay` order (back rank then
 * front rank) so the queue is deterministic. Deterministic Dawn scripts are not
 * returned here — they already ran in the bookend.
 */
export function collectInteractiveDawnRuns(
  state: BattleMutableState,
  side: BattleSide,
  alreadyProcessed: boolean,
): EffectRun[] {
  if (alreadyProcessed) return [];
  const runs: EffectRun[] = [];
  for (const id of alliesInPlay(state, side)) {
    const instance = state.cardInstances[id];
    if (instance === undefined) continue;
    const script = selectBattleCardEffectScript(instance.definition.cardId);
    if (script === null || script.trigger !== "dawn" || script.steps === undefined) {
      continue;
    }
    if (!dawnScriptIsInteractive(script)) continue;
    runs.push({
      battleCardId: id,
      cardId: instance.definition.cardId,
      side,
      trigger: "dawn",
      steps: [...script.steps],
    });
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Canonical event-name constants for battle-effect logging. */
const BATTLE_EFFECT_LOG = {
  started: "battle_proto_battle_effect_started",
  step: "battle_proto_battle_step",
  promptResolved: "battle_proto_battle_prompt_resolved",
  promptDismissedByPartner: "battle_proto_battle_prompt_dismissed_by_partner",
  resolved: "battle_proto_battle_effect_resolved",
  supportChanged: "battle_proto_battle_support_changed",
} as const;

/** Logs a battle-effect event, spreading the standard base fields. */
function logBattleEffect(
  state: BattleMutableState,
  event: string,
  payload: Record<string, unknown>,
): void {
  logEvent(event, {
    ...createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null }),
    ...payload,
  });
}

/** Extracts a loggable target id from a debug edit without using `any`. */
function extractEditTarget(edit: BattleDebugEdit): string | null {
  if ("battleCardId" in edit) return edit.battleCardId;
  if ("side" in edit) return edit.side;
  return null;
}

// ---------------------------------------------------------------------------
// useBattleEffectRunner
// ---------------------------------------------------------------------------

/**
 * Resolves the persistent-board battle triggers under basic automation:
 *
 *  - **▸Materialized** (board-diff, fires once per instance): tracks the
 *    in-play id set across renders. A newly-appeared id whose card has a
 *    `"materialized"` script is enqueued and walked through the shared step
 *    queue (`planNextEffectStep`/`applyPromptResolution`): `edits` steps
 *    dispatch immediately, while a `prompt` step pauses the run and surfaces an
 *    `activePrompt` for the UI to render (foresee / pick-cards / choice). Only
 *    one run is active at a time; further materializations queue in
 *    `pendingRef` and start when the active run completes. Characters already in
 *    play when the runner starts are seeded without firing, so they never
 *    retro-fire. A re-materialized card has a fresh `battleCardId`, so it is a
 *    new id and fires again — correct.
 *  - **Interactive ▸Dawn** (post-dawn phase scan, fires once per (side, turn)):
 *    once Dawn has passed for the active side this turn (`phase ∈
 *    POST_DAWN_PHASES`, `turnNumber > 1`), enqueues the active side's
 *    interactive Dawn scripts (those with a prompt step) onto the SAME pending
 *    queue as ▸Materialized and walks them identically. A per-(side, turn)
 *    processed key fires the scan at most once. Deterministic Dawn scripts run
 *    synchronously in the Dawn bookend (`collectDawnTriggerEdits`) and are NOT
 *    re-run here, so they are never double-applied.
 *  - **Support** (recompute, idempotent): re-derives every in-play instance's
 *    `staticSparkBonus` from the current board via `planSupportRecompute` and
 *    dispatches only the changed edits. Because the recompute is diff-only the
 *    next run after the edits commit returns `[]`, so it self-terminates.
 *
 * These concerns observe PERSISTENT board state, which survives React's dispatch
 * batching, so a `useEffect` is the right place for them. The transient Dawn
 * bookend itself is handled in `basic-automation` (React never commits a
 * `phase === "dawn"` render under automation), which is exactly why interactive
 * Dawn scripts are deferred to the post-dawn scan above.
 */
export function useBattleEffectRunner(args: BattleEffectRunnerArgs): BattleEffectRunnerResult {
  const { enabled, state, dispatchEdit, isPrimaryClient, cancelPromptSignal } = args;

  // The in-play ids observed on the previous render. `null` until the first
  // observation, which seeds the set WITHOUT firing (so characters already in
  // play when the runner mounts do not retro-fire their ▸Materialized).
  const seenInPlayRef = useRef<Set<string> | null>(null);

  // Pending materialized runs that have been detected by the board-diff but not
  // yet started. Multiple characters can materialize in one board change, but
  // only ONE run may be active at a time (a run can pause on a prompt), so they
  // wait here in FIFO order. The pump shifts the next one into `run` when idle.
  const pendingRef = useRef<EffectRun[]>([]);

  // The active run (null when idle). `steps` is the remaining queue.
  const [run, setRun] = useState<EffectRun | null>(null);

  // Whether THIS client owns the active run's authority edits. Set when the pump
  // starts a run (the primary client owns it) and flipped true when this client
  // resolves a prompt (the resolver continues the run alone while the partner's
  // overlay is dismissed). Automatic `dispatch`-plan edits fire only when this is
  // true, so a flat scripted step (no prompt) is applied by exactly one client.
  const ownsRunRef = useRef(false);

  // The active prompt shown to the player (null when idle or between prompts).
  const [activePrompt, setActivePrompt] = useState<ActivePrompt | null>(null);

  // Paused prompt + rest queue, held in a ref so resolvePrompt can read it
  // without being regenerated on every render.
  const pausedRef = useRef<{ prompt: EffectPrompt; rest: EffectStep[] } | null>(null);

  // Re-render guard: skip advance if the queue reference has not changed.
  const processedQueueRef = useRef<EffectStep[] | null>(null);

  // Monotonic counter bumped whenever new runs are enqueued. It is a dependency
  // of the pump effect so a freshly-enqueued run starts even when `run` was
  // already null (in which case `run` alone would not change and the pump effect
  // would not otherwise re-run).
  const [enqueueTick, setEnqueueTick] = useState(0);

  // The `${activeSide}:${turnNumber}` keys whose interactive-Dawn scan has
  // already run. Marked even when the scan finds zero matching cards, so the
  // scan fires at most once per (side, turn) and does not repeat every render.
  // Keys persist across the runner's lifetime: turn numbers only advance, so a
  // stale key never collides with a future (side, turn); and persisting means
  // disabling automation mid-turn then re-enabling the SAME turn does not
  // re-fire the scan (the key stays set), avoiding a double-fire.
  const processedInteractiveDawnRef = useRef<Set<string>>(new Set());

  // Last observed `cancelPromptSignal`, so the coop-dismiss effect fires only on
  // an actual change (a partner command) rather than on its initial mount value.
  const lastCancelSignalRef = useRef(cancelPromptSignal);

  const inPlayIds = inPlayInstanceIds(state);
  // A stable, order-independent key so the materialized effect re-runs only when
  // the in-play membership actually changes (not on every unrelated render).
  const inPlayKey = [...inPlayIds].sort().join(",");

  // ---------------------------------------------------------------------------
  // Materialized board-diff — enqueue newly-appeared in-play instances
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const current = new Set(inPlayIds);
    const previous = seenInPlayRef.current;

    if (previous === null) {
      // First observation: seed without firing.
      seenInPlayRef.current = current;
      return;
    }

    if (enabled) {
      const newRuns = collectNewlyMaterializedRuns(inPlayIds, previous, state);
      if (newRuns.length > 0) {
        pendingRef.current.push(...newRuns);
        // Wake the pump effect so the first enqueued run starts when none is
        // active. A counter bump (rather than calling a starter inline) avoids
        // the stale-closure trap where the imperative starter still sees the
        // pre-`setRun(null)` value of `run`.
        setEnqueueTick((t) => t + 1);
      }
    }

    // Always advance the seen set — even when disabled — so ids that entered
    // while automation was off are not retro-fired when it is toggled on.
    seenInPlayRef.current = current;
    // Depend on the in-play membership and `enabled` only; the live
    // `state`/`dispatchEdit` are read fresh each run (their identity changes
    // every render, so including them would re-run this effect needlessly).
  }, [inPlayKey, enabled]);

  // ---------------------------------------------------------------------------
  // Interactive-Dawn scan — enqueue the active side's interactive ▸Dawn scripts
  // ---------------------------------------------------------------------------
  // Deterministic Dawn scripts run synchronously in the Dawn bookend
  // (`collectDawnTriggerEdits`). Interactive ones (with a prompt step) cannot —
  // the bookend skips them — so we fire them here, once Dawn has passed for the
  // active side this turn, by enqueuing them onto the SAME pending queue the
  // ▸Materialized board-diff uses. The pump and advance effects then walk them
  // identically (edits dispatch, prompts pause). We mark the (side, turn) key
  // processed even with zero matches so the scan does not repeat each render.
  useEffect(() => {
    if (!enabled || state.result !== null) return;
    if (!shouldScanInteractiveDawn(state.phase, state.turnNumber)) return;

    const key = `${state.activeSide}:${state.turnNumber}`;
    const alreadyProcessed = processedInteractiveDawnRef.current.has(key);
    const newRuns = collectInteractiveDawnRuns(state, state.activeSide, alreadyProcessed);
    // Mark processed up front (even for zero matches) so a re-render does not
    // re-scan, and a disable→re-enable in the SAME turn does not double-fire.
    processedInteractiveDawnRef.current.add(key);
    if (newRuns.length > 0) {
      pendingRef.current.push(...newRuns);
      // Wake the pump (same counter-bump idiom as the materialized path) so the
      // first enqueued run starts even when `run` is already null.
      setEnqueueTick((t) => t + 1);
    }
    // Re-run when the active side, turn, or phase changes (the scan's gating
    // inputs), or when automation toggles. `state` is read fresh each run, so
    // its per-render identity is intentionally NOT a dependency.
  }, [enabled, state.activeSide, state.turnNumber, state.phase, state.result]);

  // ---------------------------------------------------------------------------
  // Pump effect — start the next pending run when none is active
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || state.result !== null) {
      // Clear stale pending runs on the disabled/ended transition INDEPENDENT of
      // whether a run is active. The advance effect early-returns when `run` is
      // null, so without this a queue filled while enabled (but before the pump
      // started a run) would survive a disable and replay out of context on
      // re-enable. (The processed-Dawn keys intentionally persist — see the ref.)
      pendingRef.current = [];
      return;
    }
    // One run at a time: never start (or clobber) a run while
    // another is in progress or paused on a prompt. When the active run
    // completes (`run` → null) this effect re-runs (`run` is a dependency) and
    // the next pending run starts.
    if (run !== null) return;
    const next = pendingRef.current.shift();
    if (next === undefined) return;
    // The primary client owns this run's authority edits from the start. The
    // non-primary client still starts the run (to walk to any prompt and show
    // it) but does not dispatch automatic edits — it receives them via synced
    // commands — unless it later resolves a prompt and takes ownership.
    ownsRunRef.current = isPrimaryClient;
    setRun(next);
    logBattleEffect(state, BATTLE_EFFECT_LOG.started, {
      cardId: next.cardId,
      battleCardId: next.battleCardId,
      trigger: next.trigger,
      side: next.side,
      stepCount: next.steps.length,
    });
    // Re-run when the active run finishes (`run` → null) so the next pending run
    // starts, and when a board change enqueues new runs (`enqueueTick`). `state`
    // is read fresh each run.
  }, [run, enabled, state.result, enqueueTick, state, isPrimaryClient]);

  // ---------------------------------------------------------------------------
  // Advance effect — walks the active run's queue one step at a time
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (run === null) return;

    // Abort check runs FIRST — before the prompt-pause guard — so that toggling
    // automation off or the battle ending while a prompt is open tears down the
    // run and clears the overlay instead of leaving both stuck. We also clear
    // `pendingRef` so not-yet-started runs that were enqueued while enabled
    // do not fire later out of context once automation toggles back on.
    if (!enabled || state.result !== null) {
      setRun(null);
      setActivePrompt(null);
      pausedRef.current = null;
      processedQueueRef.current = null;
      pendingRef.current = [];
      ownsRunRef.current = false;
      return;
    }

    // Prompt-pause guard: a prompt is open; wait for resolvePrompt.
    if (activePrompt !== null) return;

    // Guard against double-dispatch on re-renders that did not change the queue.
    if (processedQueueRef.current === run.steps) return;
    processedQueueRef.current = run.steps;

    const ctx: StepContext = {
      side: run.side,
      state,
      random: Math.random,
      nowMs: Date.now(),
      sourceId: run.battleCardId,
    };

    const plan = planNextEffectStep(run.steps, ctx);

    if (plan.type === "done") {
      logBattleEffect(state, BATTLE_EFFECT_LOG.resolved, {
        cardId: run.cardId,
        battleCardId: run.battleCardId,
        trigger: run.trigger,
        side: run.side,
      });
      processedQueueRef.current = null;
      // Clearing `run` re-runs the pump effect (it depends on `run`), which
      // starts the next pending materialization (if any).
      setRun(null);
    } else if (plan.type === "dispatch") {
      logBattleEffect(state, BATTLE_EFFECT_LOG.step, {
        cardId: run.cardId,
        battleCardId: run.battleCardId,
        editKinds: plan.edits.map((e) => e.kind),
        targetIds: plan.edits.map((e) => extractEditTarget(e)),
        dispatched: ownsRunRef.current,
      });
      // Only the run's owner dispatches these authority edits; the non-owner
      // walks the queue (so it reaches and shows any later prompt) but receives
      // the resulting state via synced commands instead of applying it locally.
      // Without this gate both coop clients would apply the same edit.
      if (ownsRunRef.current) {
        for (const edit of plan.edits) {
          dispatchEdit(edit);
        }
      }
      // Advance the queue by updating steps to a new array so this effect
      // re-runs and processes the next step.
      setRun({ ...run, steps: plan.rest });
    } else {
      // plan.type === "prompt"
      pausedRef.current = { prompt: plan.prompt, rest: plan.rest };
      setActivePrompt(plan.active);
      // Do NOT advance — wait for resolvePrompt.
    }
  }, [run, activePrompt, enabled, state, dispatchEdit]);

  // ---------------------------------------------------------------------------
  // resolvePrompt — called by UI when the player makes a choice
  // ---------------------------------------------------------------------------
  const resolvePrompt = useCallback(
    (resolution: PromptResolution) => {
      const paused = pausedRef.current;
      if (paused === null) return;
      // run must be non-null whenever pausedRef is set (a prompt is only opened
      // from inside the advance effect which already guards run !== null).
      if (run === null) return;

      const ctx: StepContext = {
        side: run.side,
        state,
        random: Math.random,
        nowMs: Date.now(),
        sourceId: run.battleCardId,
      };

      const { edits, rest } = applyPromptResolution(paused.prompt, resolution, paused.rest, ctx);

      // Capture candidateIds before clearing activePrompt.
      const candidateIds =
        activePrompt?.kind === "pick-cards" ? activePrompt.candidateIds : null;

      const choice: unknown =
        resolution.kind === "pick-cards"
          ? resolution.chosenIds
          : resolution.kind === "choice"
            ? resolution.optionIndex
            : "foresee";

      logBattleEffect(state, BATTLE_EFFECT_LOG.promptResolved, {
        cardId: run.cardId,
        battleCardId: run.battleCardId,
        promptKind: paused.prompt.kind,
        // The foresee prompt kind has no label field; the cast surfaces it safely.
        label: (paused.prompt as { label?: string }).label ?? null,
        candidateIds,
        choice,
        resultingEditKinds: edits.map((e) => e.kind),
      });

      // Resolving the prompt makes THIS client the run's owner: the partner's
      // overlay is torn down by `cancelPromptSignal`, so this client is now the
      // sole driver of the remaining queue and must dispatch its edits (these
      // resolution edits, and any automatic steps after the prompt) exactly once.
      ownsRunRef.current = true;
      for (const edit of edits) {
        dispatchEdit(edit);
      }

      pausedRef.current = null;
      setActivePrompt(null);
      setRun({ ...run, steps: rest });
    },
    [run, activePrompt, state, dispatchEdit],
  );

  // ---------------------------------------------------------------------------
  // Coop dismiss — partner resolved this prompt on their client
  // ---------------------------------------------------------------------------
  // When `cancelPromptSignal` changes our coop partner advanced the shared
  // battle. Their resolution edits — and the rest of the paused run's queue,
  // which they walk — sync to us as commands, so we just tear down the active
  // run AND the pending queue (mirroring the abort teardown) and clear the
  // overlay; the not-yet-started pending runs are dropped so they cannot replay
  // out of context now that the partner is driving. Guarded on an open prompt so
  // unrelated partner moves do not disturb an in-progress run.
  useEffect(() => {
    if (cancelPromptSignal === lastCancelSignalRef.current) return;
    lastCancelSignalRef.current = cancelPromptSignal;
    if (activePrompt === null) return;
    logBattleEffect(state, BATTLE_EFFECT_LOG.promptDismissedByPartner, {
      cardId: run?.cardId ?? null,
      battleCardId: run?.battleCardId ?? null,
      trigger: run?.trigger ?? null,
      promptKind: activePrompt.kind,
    });
    setRun(null);
    setActivePrompt(null);
    pausedRef.current = null;
    processedQueueRef.current = null;
    pendingRef.current = [];
    ownsRunRef.current = false;
  }, [cancelPromptSignal, activePrompt, run, state]);

  // ---------------------------------------------------------------------------
  // Support — idempotent recompute of staticSparkBonus
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Authority-only: the recompute writes shared `staticSparkBonus` edits, so a
    // non-primary client running it too would double-write them to the room. It
    // receives the authority's recompute via synced commands instead. (Runs
    // regardless of `enabled`: when disabled, planSupportRecompute targets every
    // in-play instance to 0, clearing any prior bonus.)
    if (!isPrimaryClient) return;
    const edits = planSupportRecompute(state, enabled, Date.now());
    if (edits.length === 0) return;
    for (const edit of edits) {
      dispatchEdit(edit);
    }
    logBattleEffect(state, BATTLE_EFFECT_LOG.supportChanged, {
      changes: edits.flatMap((edit) =>
        edit.kind === "SET_CARD_STATIC_SPARK_BONUS"
          ? [{ battleCardId: edit.battleCardId, value: edit.value }]
          : [],
      ),
    });
    // Depend on the Support-relevant board shape (occupancy + each instance's
    // current bonus) so the recompute re-runs to its fixed point but not on
    // unrelated renders. `state`/`dispatchEdit` are read fresh each run.
  }, [enabled, isPrimaryClient, supportShapeKey(state)]);

  return {
    activePrompt,
    activePromptSide: run?.side ?? null,
    resolvePrompt,
  };
}

/**
 * A key over the Support-relevant board shape: every rank slot's occupant id
 * paired with that instance's current `staticSparkBonus`. When a character's
 * spark target could change — a supporter or supported ally enters or leaves a
 * slot, or a bonus shifts — this key changes and the recompute re-runs until it
 * reaches its fixed point (`planSupportRecompute` returning `[]`). Subtype is not
 * part of the key because it is fixed for a given `battleCardId`, so a predicate
 * such as Eternal Stag's spirit-animal filter cannot go stale without the
 * occupant id (and thus the key) already changing.
 */
function supportShapeKey(state: BattleMutableState): string {
  const parts: string[] = [];
  for (const side of ["player", "enemy"] as const) {
    for (const slotId of rankSlotIds(state.sides[side].backRank)) {
      const id = state.sides[side].backRank[slotId];
      parts.push(`b:${side}:${slotId}:${id ?? ""}:${slotBonus(state, id)}`);
    }
    for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
      const id = state.sides[side].frontRank[slotId];
      parts.push(`f:${side}:${slotId}:${id ?? ""}:${slotBonus(state, id)}`);
    }
  }
  return parts.join("|");
}

/** Current `staticSparkBonus` of the instance at an id, or `-` when empty. */
function slotBonus(state: BattleMutableState, id: string | null): string {
  if (id === null) return "-";
  const instance = state.cardInstances[id];
  return instance === undefined ? "?" : String(instance.staticSparkBonus);
}
