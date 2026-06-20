import type { QuestState } from "../types/quest";

/**
 * A detected illegal quest-state transition. `invariant` is a stable id for the
 * rule that was broken (logged and asserted on); `detail` carries the specifics
 * for reconstruction.
 */
export interface QuestStateInvariantViolation {
  invariant: string;
  detail: Record<string, unknown>;
}

/**
 * Core run fields that are established once when a run begins and persist for
 * the rest of the run. None may be transitioned from a populated value back to
 * `null` by a state write: a non-null -> null flip means some write path
 * persisted a "cleared" value computed for a narrower purpose (for example a
 * card-less shop's `draftState: null`) into the shared run state, silently
 * destroying it.
 *
 * Starting a fresh run / resetting replaces the whole quest-state object rather
 * than transitioning one of these fields, so it is observed as `prev === null`
 * (or a brand-new object) and is intentionally not flagged here.
 */
const NON_NULLABLE_RUN_FIELDS = [
  "draftState",
  "resolvedPackage",
  "dreamcaller",
] as const satisfies readonly (keyof QuestState)[];

/**
 * Returns every invariant that the `prev -> next` quest-state transition
 * breaks, or an empty array when the transition is legal. Pure and side-effect
 * free so it can be unit-tested directly and called from a hot write path; the
 * caller decides whether to log, throw, or both.
 *
 * A `null`/`undefined` on either side is treated as run creation or teardown
 * (not a field transition) and never flagged.
 */
export function findQuestStateInvariantViolations(
  prev: QuestState | null | undefined,
  next: QuestState | null | undefined,
): QuestStateInvariantViolation[] {
  const violations: QuestStateInvariantViolation[] = [];
  if (prev === null || prev === undefined || next === null || next === undefined) {
    return violations;
  }
  for (const field of NON_NULLABLE_RUN_FIELDS) {
    if (prev[field] !== null && next[field] === null) {
      violations.push({
        invariant: `${field}_must_not_revert_to_null`,
        detail: { field },
      });
    }
  }
  return violations;
}
