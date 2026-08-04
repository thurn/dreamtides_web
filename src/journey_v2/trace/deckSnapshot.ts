import { sha256 } from "js-sha256";
import type { CardData } from "../../types/cards";
import type { MerchantContext } from "../types";

/**
 * A compact, explanatory snapshot of the deck the merchant scored against.
 *
 * Scores are only explainable if their inputs are visible. The fit / quality
 * scorers operate over the deck's cards, and the dreamsign-coverage and
 * tribal-count scorers key off the deck's feature tallies. This snapshot carries
 * both: the exact `cardNumbers` (small integers, a deck is at most a few dozen
 * cards) plus a `hash` for cross-event joins, and the derived `features` the
 * scorers actually consume. It is emitted once per encounter (the deck is the
 * same for both offers) on `merchant_encounter_generated`; each
 * `merchant_offer_built` line back-references it by `size` + `hash`.
 *
 * Feature tallies are computed over each entry's printed card, which is what the
 * dreamsign-coverage scorer reads.
 */
export interface MerchantDeckSnapshot {
  /** Deck size (entry count). */
  size: number;
  /** Sorted printed card numbers — the exact deck the scores ran against. */
  cardNumbers: readonly number[];
  /** Stable hash of the deck's card content and per-entry modifications. */
  hash: string;
  /** Derived feature tallies the dreamsign / tribal scorers key off. */
  features: MerchantDeckFeatureTallies;
}

/** Feature tallies the merchant scorers derive from the deck. */
export interface MerchantDeckFeatureTallies {
  /** Count of deck cards per card type (Character, Event, …). */
  cardType: Record<string, number>;
  /** Count of deck cards per subtype (Warrior, Spirit Animal, …). */
  subtype: Record<string, number>;
  /** Count of deck cards per cost band: cheap (<=1), mid (2-3), big (>=4), variable. */
  costBand: Record<string, number>;
  /** Count of deck cards carrying each keyword: reclaim, fast. */
  keyword: Record<string, number>;
}

function costBandOf(card: CardData): string {
  const cost = card.energyCost;
  if (cost === null) return "variable";
  if (cost <= 1) return "cheap";
  if (cost <= 3) return "mid";
  return "big";
}

function increment(tally: Record<string, number>, key: string): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

/** Tallies the deck's card-type / subtype / cost-band / keyword features. */
export function deckFeatureTallies(
  cards: readonly CardData[],
): MerchantDeckFeatureTallies {
  const cardType: Record<string, number> = {};
  const subtype: Record<string, number> = {};
  const costBand: Record<string, number> = {};
  const keyword: Record<string, number> = {};
  for (const card of cards) {
    increment(cardType, card.cardType);
    increment(subtype, card.subtype);
    increment(costBand, costBandOf(card));
    if (card.reclaimCost !== undefined && card.reclaimCost !== null) {
      increment(keyword, "reclaim");
    }
    if (card.isFast) increment(keyword, "fast");
  }
  return { cardType, subtype, costBand, keyword };
}

/**
 * Builds the deck snapshot from a merchant context. The `hash` covers each
 * entry's card number and modifications (transfiguration, type change, keyword
 * modification, Nightmare flag) sorted for stability, so two encounters scored
 * against the same deck content share a hash.
 */
export function buildMerchantDeckSnapshot(
  context: MerchantContext,
): MerchantDeckSnapshot {
  const cards = context.deckCards.map((deckCard) => deckCard.card);
  const cardNumbers = context.deckCards
    .map((deckCard) => deckCard.cardNumber)
    .sort((a, b) => a - b);
  const hashInput = context.deckCards
    .map((deckCard) =>
      [
        deckCard.cardNumber,
        deckCard.deckEntry.transfiguration ?? "",
        deckCard.deckEntry.typeChange?.predicateId ?? "",
        deckCard.deckEntry.keywordModification === undefined ? "" : "kw",
        deckCard.deckEntry.isBane ? "nightmare" : "",
      ].join(":"),
    )
    .sort()
    .join("|");
  return {
    size: context.deckCards.length,
    cardNumbers,
    hash: sha256(hashInput),
    features: deckFeatureTallies(cards),
  };
}
