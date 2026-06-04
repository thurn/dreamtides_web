/**
 * Support-adjacency map for the battle battlefield.
 *
 * Rules (battle_rules.md §B): each reserve slot (back rank B0–B4) supports the
 * front-rank deploy slots that are adjacent to it:
 *   B0 → F0          (R0 → D0)
 *   B1 → F0, F1      (R1 → D0, D1)
 *   B2 → F1, F2      (R2 → D1, D2)
 *   B3 → F2, F3      (R3 → D2, D3)
 *   B4 → F3          (R4 → D3)
 *
 * Code ids: reserve slots are R0–R4, deploy slots are D0–D3.
 */

import type { DeploySlotId, ReserveSlotId } from "../types";

const SUPPORTED_DEPLOY_SLOTS: Readonly<Record<ReserveSlotId, readonly DeploySlotId[]>> = Object.freeze({
  R0: Object.freeze(["D0"]) as readonly DeploySlotId[],
  R1: Object.freeze(["D0", "D1"]) as readonly DeploySlotId[],
  R2: Object.freeze(["D1", "D2"]) as readonly DeploySlotId[],
  R3: Object.freeze(["D2", "D3"]) as readonly DeploySlotId[],
  R4: Object.freeze(["D3"]) as readonly DeploySlotId[],
});

const SUPPORTING_RESERVE_SLOTS: Readonly<Record<DeploySlotId, readonly ReserveSlotId[]>> = Object.freeze({
  D0: Object.freeze(["R0", "R1"]) as readonly ReserveSlotId[],
  D1: Object.freeze(["R1", "R2"]) as readonly ReserveSlotId[],
  D2: Object.freeze(["R2", "R3"]) as readonly ReserveSlotId[],
  D3: Object.freeze(["R3", "R4"]) as readonly ReserveSlotId[],
});

/**
 * Returns the deploy slots (front rank) that the given reserve slot supports.
 */
export function supportedDeploySlots(reserve: ReserveSlotId): DeploySlotId[] {
  return [...SUPPORTED_DEPLOY_SLOTS[reserve]];
}

/**
 * Returns the reserve slots (back rank) that support the given deploy slot.
 */
export function supportingReserveSlots(deploy: DeploySlotId): ReserveSlotId[] {
  return [...SUPPORTING_RESERVE_SLOTS[deploy]];
}
