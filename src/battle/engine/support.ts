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

import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import type { FrontRankSlotId, BackRankSlotId } from "../types";

/**
 * Returns the deploy slots (front rank) that the given reserve slot supports:
 * `Bi` supports `F(i-1)` and `Fi`, clipped to valid front-rank indices.
 */
export function supportedDeploySlots(reserve: BackRankSlotId): FrontRankSlotId[] {
  const i = BACK_RANK_SLOT_IDS.indexOf(reserve);
  const result: FrontRankSlotId[] = [];
  for (const j of [i - 1, i]) {
    if (j >= 0 && j < FRONT_RANK_SLOT_IDS.length) {
      result.push(FRONT_RANK_SLOT_IDS[j]);
    }
  }
  return result;
}

/**
 * Returns the reserve slots (back rank) that support the given deploy slot:
 * `Fj` is supported by `Bj` and `B(j+1)`, clipped to valid back-rank indices.
 */
export function supportingReserveSlots(deploy: FrontRankSlotId): BackRankSlotId[] {
  const j = FRONT_RANK_SLOT_IDS.indexOf(deploy);
  const result: BackRankSlotId[] = [];
  for (const i of [j, j + 1]) {
    if (i >= 0 && i < BACK_RANK_SLOT_IDS.length) {
      result.push(BACK_RANK_SLOT_IDS[i]);
    }
  }
  return result;
}
