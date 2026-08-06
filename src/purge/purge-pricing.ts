/**
 * Pricing for paid card purges.
 *
 * Purging costs essence and is offered at a Purge site in every dreamscape.
 * The cost escalates with each card removed in a single visit, and the counter
 * resets at every dreamscape, so steady pruning of one or two cards per visit
 * stays cheap while emptying a large part of the deck in a single visit is
 * expensive.
 *
 * Economy data supplies the ordered marginal-cost table and the enhanced-site
 * discount. The algorithm sums the first N entries and combines authored and
 * run-scoped discounts. The table length is also the paid-purge visit cap.
 */

import type { EconomyData } from "../types/economy-data";

/** Discounts that reduce purge prices for a visit. */
export interface PurgePriceModifiers {
  /** True at an enhanced Purge site, which discounts the whole visit. */
  isEnhanced?: boolean;
  /** Shop-wide essence discount that also applies to purges, in percent. */
  essenceDiscountPercent?: number;
}

/**
 * Marginal, pre-discount essence cost of the `cardIndex`-th card purged in a
 * visit. `cardIndex` is 1-based: the first card purged is index 1.
 */
export function purgeMarginalCost(config: EconomyData["purge"], cardIndex: number): number {
  if (cardIndex <= 0) return 0;
  return config.marginalCosts[cardIndex - 1] ?? Infinity;
}

/** Total discount percent applied to purge prices for a visit, clamped 0-100. */
export function purgeDiscountPercent(
  config: EconomyData["purge"],
  modifiers: PurgePriceModifiers = {},
): number {
  const enhanced = modifiers.isEnhanced ? config.enhancedDiscountPercent : 0;
  const essence = Math.max(0, modifiers.essenceDiscountPercent ?? 0);
  return Math.min(100, enhanced + essence);
}

/**
 * Price of the `cardIndex`-th card purged in a visit after discounts.
 * `cardIndex` is 1-based.
 */
export function purgeCardPrice(
  config: EconomyData["purge"],
  cardIndex: number,
  modifiers: PurgePriceModifiers = {},
): number {
  const raw = purgeMarginalCost(config, cardIndex);
  const discount = purgeDiscountPercent(config, modifiers);
  if (discount === 0) return raw;
  return Math.round(raw * (1 - discount / 100));
}

/**
 * Cumulative essence cost of purging `count` cards in a single visit after
 * discounts.
 */
export function purgeVisitCost(
  config: EconomyData["purge"],
  count: number,
  modifiers: PurgePriceModifiers = {},
): number {
  let total = 0;
  for (let i = 1; i <= count; i += 1) {
    total += purgeCardPrice(config, i, modifiers);
  }
  return total;
}

/**
 * Largest number of cards (0-`maxCards`) that can be purged this visit for at
 * most `essence`, given the visit's discounts. Used to gate selection so the
 * player cannot commit to a purge they cannot afford.
 */
export function maxAffordablePurgeCount(
  config: EconomyData["purge"],
  essence: number,
  maxCards: number,
  modifiers: PurgePriceModifiers = {},
): number {
  let total = 0;
  for (let i = 1; i <= maxCards; i += 1) {
    total += purgeCardPrice(config, i, modifiers);
    if (total > essence) return i - 1;
  }
  return maxCards;
}
