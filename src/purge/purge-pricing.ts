/**
 * Pricing for paid card purges.
 *
 * Purging costs essence and is offered at a Purge site in every dreamscape.
 * The cost escalates with each card removed in a single visit, and the counter
 * resets at every dreamscape, so steady pruning of one or two cards per visit
 * stays cheap while emptying a large part of the deck in a single visit is
 * expensive.
 *
 * Marginal cost of the Nth card purged in a visit is `30 + 5 * N * (N + 1)`:
 *
 * | Card # | Marginal | Cumulative |
 * | ------ | -------- | ---------- |
 * |   1    |    40    |     40     |
 * |   2    |    60    |    100     |
 * |   3    |    90    |    190     |
 * |   4    |   130    |    320     |
 * |   5    |   180    |    500     |
 * |   6    |   240    |    740     |
 *
 * A single-card trim stays cheap (40 essence), while the cost climbs steeply
 * once a visit removes several cards: three cards in one visit cost 190, more
 * than four times a single trim, so emptying a large part of the deck at once
 * requires arriving with a deep essence reserve.
 */

/** Soft cap on how many cards may be purged in a single visit. */
export const MAX_PURGE_PER_VISIT = 6;

/** Discount applied to the whole visit at an enhanced Purge site, in percent. */
export const PURGE_ENHANCED_DISCOUNT_PERCENT = 30;

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
export function purgeMarginalCost(cardIndex: number): number {
  if (cardIndex <= 0) return 0;
  return 30 + 5 * cardIndex * (cardIndex + 1);
}

/** Total discount percent applied to purge prices for a visit, clamped 0-100. */
export function purgeDiscountPercent(
  modifiers: PurgePriceModifiers = {},
): number {
  const enhanced = modifiers.isEnhanced ? PURGE_ENHANCED_DISCOUNT_PERCENT : 0;
  const essence = Math.max(0, modifiers.essenceDiscountPercent ?? 0);
  return Math.min(100, enhanced + essence);
}

/**
 * Price of the `cardIndex`-th card purged in a visit after discounts.
 * `cardIndex` is 1-based.
 */
export function purgeCardPrice(
  cardIndex: number,
  modifiers: PurgePriceModifiers = {},
): number {
  const raw = purgeMarginalCost(cardIndex);
  const discount = purgeDiscountPercent(modifiers);
  if (discount === 0) return raw;
  return Math.round(raw * (1 - discount / 100));
}

/**
 * Cumulative essence cost of purging `count` cards in a single visit after
 * discounts.
 */
export function purgeVisitCost(
  count: number,
  modifiers: PurgePriceModifiers = {},
): number {
  let total = 0;
  for (let i = 1; i <= count; i += 1) {
    total += purgeCardPrice(i, modifiers);
  }
  return total;
}

/**
 * Largest number of cards (0-`maxCards`) that can be purged this visit for at
 * most `essence`, given the visit's discounts. Used to gate selection so the
 * player cannot commit to a purge they cannot afford.
 */
export function maxAffordablePurgeCount(
  essence: number,
  maxCards: number,
  modifiers: PurgePriceModifiers = {},
): number {
  let total = 0;
  for (let i = 1; i <= maxCards; i += 1) {
    total += purgeCardPrice(i, modifiers);
    if (total > essence) return i - 1;
  }
  return maxCards;
}
