/**
 * Support-adjacency geometry for the staggered battlefield (rules §Support).
 *
 * The grid is staggered with the back rank one slot wider than the front rank,
 * so each back-rank slot sits behind the (up to two) front-rank slots adjacent
 * to it. Numbering slots left to right from 0, back-rank `Bi` supports front-rank
 * `F(i-1)` and `Fi` wherever those exist; inversely, front-rank `Fj` is supported
 * by `Bj` and `B(j+1)`. At the starting layout (front F0–F1, back B0–B2) this is
 * `B0→[F0]`, `B1→[F0,F1]`, `B2→[F1]`. The same formula generalizes to any size
 * the play area expands to, clipped at the slot universe's edges.
 */

import { backRankSlotId, frontRankSlotId, slotIndex } from "../types";
import type { FrontRankSlotId, BackRankSlotId } from "../types";

/**
 * Returns the deploy slots (front rank) that the given reserve slot supports:
 * `Bi` supports `F(i-1)` and `Fi`, for any non-negative front-rank index.
 */
export function supportedDeploySlots(reserve: BackRankSlotId): FrontRankSlotId[] {
  const i = slotIndex(reserve);
  const result: FrontRankSlotId[] = [];
  for (const j of [i - 1, i]) {
    if (j >= 0) {
      result.push(frontRankSlotId(j));
    }
  }
  return result;
}

/**
 * Returns the reserve slots (back rank) that support the given deploy slot:
 * `Fj` is supported by `Bj` and `B(j+1)`, for any non-negative back-rank index.
 */
export function supportingReserveSlots(deploy: FrontRankSlotId): BackRankSlotId[] {
  const j = slotIndex(deploy);
  const result: BackRankSlotId[] = [];
  for (const i of [j, j + 1]) {
    if (i >= 0) {
      result.push(backRankSlotId(i));
    }
  }
  return result;
}
