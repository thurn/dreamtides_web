// CEC (cost / effect / consequence) sizing primitives.
//
// CARD_CEC is the canonical per-card weight used when sizing card-pool rewards
// and costs. STAGE_MULTIPLIER scales every CEC computation by the current
// stage; callers may pass a custom multiplier if a template needs to depart
// from the default.

import type { Predicate } from "./types";

export const CARD_CEC = 40;

export const STAGE_MULTIPLIER = 1.0;

export function cardPoolCEC(
  perItem: number,
  count: number,
  predicate: Predicate,
  stageMultiplier: number = STAGE_MULTIPLIER,
): number {
  return perItem * count * predicate.multiplier * stageMultiplier;
}
