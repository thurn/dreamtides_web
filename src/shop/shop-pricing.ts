/** Base cost for a shop reroll, paid in essence. */
export const REROLL_ESSENCE_COST = 50;

/** Computes the authoritative essence reroll cost. */
export function rerollCost(_rerollCount: number, isEnhanced: boolean): number {
  return isEnhanced ? 0 : REROLL_ESSENCE_COST;
}
