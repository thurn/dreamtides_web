// Dreamtides 97 card prices (Appendix A §A3–A5): a card's base value from its
// printed energy cost, spark, type and speed raised by rarity; the buy quote
// in a price band, clamped; the unclamped sale quote; and the resale guard,
// which caps a copy bought for Essence at the Essence paid. Prices use
// catalog values only, never a copy's modifications.

import type { D97ShopTuning } from "../../content/d97/shop";
import type { CardData, Rarity } from "../../types/cards";
import type { D97OwnedCopy } from "../collection/types";

/** The printed facts a card's price derives from. */
export interface D97CardPriceFacts {
  /** Null for an X cost. */
  readonly energyCost: number | null;
  /** Null when absent or X. */
  readonly spark: number | null;
  readonly character: boolean;
  readonly fast: boolean;
  readonly rarity: Rarity;
}

/** A catalog card's price facts; a card without a rarity prices as Common. */
export function cardPriceFactsOf(card: CardData): D97CardPriceFacts {
  return {
    energyCost: card.energyCost,
    spark: card.spark,
    character: card.cardType === "Character",
    fast: card.isFast,
    rarity: card.rarity ?? "Common",
  };
}

/** The card's base value `v` (§A4). */
export function cardBaseValue(card: D97CardPriceFacts, tuning: D97ShopTuning): number {
  const energy = card.energyCost ?? tuning.xEnergy;
  let value = tuning.energyUnit * (energy + 1) + (card.character ? tuning.sparkUnit * (card.spark ?? 0) : 0);
  if (card.fast) value = Math.floor((value * tuning.fastNumerator) / tuning.fastDenominator);
  const rarity = tuning.rarity[card.rarity];
  return Math.max(value * rarity.multiplier, rarity.floor);
}

function bandQuote(value: number, band: number, tuning: D97ShopTuning): number {
  return tuning.step * Math.floor((value * (band + tuning.bandOffset)) / tuning.divisor);
}

/** The buy quote in a dream of price band `band` (§A4). */
export function buyQuote(value: number, band: number, tuning: D97ShopTuning): number {
  return Math.min(Math.max(bandQuote(value, band, tuning), tuning.minQuote), tuning.maxQuote);
}

/** What a shop in price band `band` pays for `copy`: the unclamped quote, under the resale guard (§A5). */
export function saleQuote(copy: D97OwnedCopy, value: number, band: number, tuning: D97ShopTuning): number {
  const quote = bandQuote(value, band, tuning);
  const paid = copy.provenance.channel === "shop" ? copy.provenance.price : undefined;
  return paid === undefined ? quote : Math.min(quote, paid);
}

/** A restock's price in price band `band` (§A6). */
export function restockPrice(band: number, tuning: D97ShopTuning): number {
  return tuning.restockUnit * (band + tuning.bandOffset);
}

/** The shop's slot count in price band `band` (§A6). */
export function shopSlotCount(band: number, tuning: D97ShopTuning): number {
  return band + tuning.slotBase;
}

/** The highest rarity cost slot `index` may offer (§A6). */
export function slotCeiling(index: number, tuning: D97ShopTuning): number {
  return (index % tuning.slotCeilingCycle) + 1;
}
