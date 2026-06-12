import { useEffect, useRef } from "react";
import { createBattleLogBaseFields, logEvent } from "../../logging";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleCardInstance, BattleMutableState } from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import type { StepContext } from "./effect-step";
import {
  planSupportRecompute,
  selectBattleCardEffectScript,
} from "./battle-card-effects-table";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BattleEffectRunnerArgs {
  enabled: boolean; // isBasicAutomationEnabled
  state: BattleMutableState; // reducerState.mutable (live, per-render)
  dispatchEdit: (edit: BattleDebugEdit) => void; // bypasses planBasicAutomationCommands
}

// ---------------------------------------------------------------------------
// Pure detection helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * The edits a freshly-materialized character contributes when automation
 * resolves its ▸Materialized trigger. If `instance.definition.cardId` has a
 * registered `"materialized"` script, runs each edits-step `build(ctx)` and
 * concatenates them in order, with `ctx.side = instance.controller`. Any
 * non-edits step is skipped defensively with a `console.warn` (V1 materialized
 * scripts are all edits). Returns `[]` when no materialized script applies.
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
    for (const slotId of BACK_RANK_SLOT_IDS) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) ids.push(id);
    }
    for (const slotId of FRONT_RANK_SLOT_IDS) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) ids.push(id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Canonical event-name constants for battle-effect logging. */
const BATTLE_EFFECT_LOG = {
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
 * Resolves the two persistent-board battle triggers under basic automation:
 *
 *  - **▸Materialized** (board-diff, fires once per instance): tracks the
 *    in-play id set across renders. A newly-appeared id whose card has a
 *    `"materialized"` script dispatches that script's deterministic edits once.
 *    Characters already in play when the runner starts are seeded without
 *    firing, so they never retro-fire. A re-materialized card has a fresh
 *    `battleCardId`, so it is a new id and fires again — correct.
 *  - **Support** (recompute, idempotent): re-derives every in-play instance's
 *    `staticSparkBonus` from the current board via `planSupportRecompute` and
 *    dispatches only the changed edits. Because the recompute is diff-only the
 *    next run after the edits commit returns `[]`, so it self-terminates.
 *
 * Both concerns observe PERSISTENT board state, which survives React's dispatch
 * batching, so a `useEffect` is the right place for them. (The transient Dawn
 * bookend is handled in `basic-automation`, not here, because React never
 * commits a `phase === "dawn"` render under automation.)
 *
 * This runner handles DETERMINISTIC EDITS ONLY: the registered V1 materialized
 * scripts use edits-steps exclusively, so there is no prompt state machine.
 */
export function useBattleEffectRunner(args: BattleEffectRunnerArgs): void {
  const { enabled, state, dispatchEdit } = args;

  // The in-play ids observed on the previous render. `null` until the first
  // observation, which seeds the set WITHOUT firing (so characters already in
  // play when the runner mounts do not retro-fire their ▸Materialized).
  const seenInPlayRef = useRef<Set<string> | null>(null);

  const inPlayIds = inPlayInstanceIds(state);
  // A stable, order-independent key so the materialized effect re-runs only when
  // the in-play membership actually changes (not on every unrelated render).
  const inPlayKey = [...inPlayIds].sort().join(",");

  // ---------------------------------------------------------------------------
  // Materialized — fire once per newly-appeared in-play instance
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
      for (const id of inPlayIds) {
        if (previous.has(id)) continue;
        const instance = state.cardInstances[id];
        if (instance === undefined) continue;
        const edits = materializedScriptEdits(instance, state, Date.now());
        if (edits.length === 0) continue;
        for (const edit of edits) {
          dispatchEdit(edit);
        }
        logBattleEffect(state, BATTLE_EFFECT_LOG.resolved, {
          cardId: instance.definition.cardId,
          cardName: instance.definition.name,
          trigger: "materialized",
          side: instance.controller,
          editKinds: edits.map((e) => e.kind),
          targetIds: edits.map((e) => extractEditTarget(e)),
        });
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
  // Support — idempotent recompute of staticSparkBonus
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Runs regardless of `enabled`: when disabled, planSupportRecompute targets
    // every in-play instance to 0, clearing any prior bonus.
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
  }, [enabled, supportShapeKey(state)]);
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
    for (const slotId of BACK_RANK_SLOT_IDS) {
      const id = state.sides[side].backRank[slotId];
      parts.push(`b:${side}:${slotId}:${id ?? ""}:${slotBonus(state, id)}`);
    }
    for (const slotId of FRONT_RANK_SLOT_IDS) {
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
