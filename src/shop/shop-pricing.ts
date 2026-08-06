import type { EconomyData } from "../types/economy-data";

/** Computes the authoritative essence reroll cost. */
export function rerollCost(config: EconomyData["shop"]["reroll"], _rerollCount: number, isEnhanced: boolean): number {
  return isEnhanced ? config.enhancedPrice : config.standardPrice;
}
