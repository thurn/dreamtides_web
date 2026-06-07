/**
 * Support-adjacency map for the battle battlefield.
 *
 * Rules (battle_rules.md §B): each reserve slot (back rank B0–B4) supports the
 * front-rank deploy slots that are adjacent to it:
 *   B0 → F0
 *   B1 → F0, F1
 *   B2 → F1, F2
 *   B3 → F2, F3
 *   B4 → F3
 *
 * Code ids: back-rank slots are B0–B4, front-rank slots are F0–F3.
 */

import type { FrontRankSlotId, BackRankSlotId } from "../types";

const SUPPORTED_DEPLOY_SLOTS: Readonly<Record<BackRankSlotId, readonly FrontRankSlotId[]>> = Object.freeze({
  B0: Object.freeze(["F0"]) as readonly FrontRankSlotId[],
  B1: Object.freeze(["F0", "F1"]) as readonly FrontRankSlotId[],
  B2: Object.freeze(["F1", "F2"]) as readonly FrontRankSlotId[],
  B3: Object.freeze(["F2", "F3"]) as readonly FrontRankSlotId[],
  B4: Object.freeze(["F3"]) as readonly FrontRankSlotId[],
});

const SUPPORTING_RESERVE_SLOTS: Readonly<Record<FrontRankSlotId, readonly BackRankSlotId[]>> = Object.freeze({
  F0: Object.freeze(["B0", "B1"]) as readonly BackRankSlotId[],
  F1: Object.freeze(["B1", "B2"]) as readonly BackRankSlotId[],
  F2: Object.freeze(["B2", "B3"]) as readonly BackRankSlotId[],
  F3: Object.freeze(["B3", "B4"]) as readonly BackRankSlotId[],
});

/**
 * Returns the deploy slots (front rank) that the given reserve slot supports.
 */
export function supportedDeploySlots(reserve: BackRankSlotId): FrontRankSlotId[] {
  return [...SUPPORTED_DEPLOY_SLOTS[reserve]];
}

/**
 * Returns the reserve slots (back rank) that support the given deploy slot.
 */
export function supportingReserveSlots(deploy: FrontRankSlotId): BackRankSlotId[] {
  return [...SUPPORTING_RESERVE_SLOTS[deploy]];
}
