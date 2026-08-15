import { sha256 } from "js-sha256";
import type { CardData, CardType } from "../../types/cards";
import type { CardSubtype } from "../../types/card-identity";
import type { AuguryContext } from "../types";
import {
  parseStableDigest,
  type StableDigest,
} from "../../reward-selection/stable";

/**
 * A compact, explanatory snapshot of the deck the augury scored against.
 *
 * Scores are only explainable if their inputs are visible. The fit / quality
 * scorers operate over the deck's cards, and the dreamsign-coverage and
 * tribal-count scorers key off the deck's feature tallies. This snapshot carries
 * both: the exact `cardNumbers` (small integers, a deck is at most a few dozen
 * cards) plus a `hash` for cross-event joins, and the derived `features` the
 * scorers actually consume. It is emitted once per encounter (the deck is the
 * same for both offers) on `augury_encounter_generated`; each
 * `augury_offer_built` line back-references it by `size` + `hash`.
 *
 * Feature tallies are computed over each entry's printed card, which is what the
 * dreamsign-coverage scorer reads.
 */
export interface AuguryDeckSnapshot {
  /** Deck size (entry count). */
  size: number;
  /** Sorted printed card numbers — the exact deck the scores ran against. */
  cardNumbers: readonly number[];
  /** Stable hash of the deck's card content and per-entry modifications. */
  hash: StableDigest;
  /** Derived feature tallies the dreamsign / tribal scorers key off. */
  features: AuguryDeckFeatureTallies;
}

/** Feature tallies the augury scorers derive from the deck. */
export interface AuguryDeckFeatureTallies {
  /** Count of deck cards per card type (Character, Event, …). */
  cardType: Partial<Record<CardType, number>>;
  /** Count of deck cards per subtype (Warrior, Spirit Animal, …). */
  subtype: Partial<Record<CardSubtype, number>>;
  /** Count of deck cards per cost band: cheap (<=1), mid (2-3), big (>=4), variable. */
  costBand: Partial<Record<AuguryDeckCostBand, number>>;
  /** Count of deck cards carrying each keyword: reclaim, fast. */
  keyword: Partial<Record<AuguryDeckKeyword, number>>;
}

type AuguryDeckCostBand = "variable" | "cheap" | "mid" | "big";
type AuguryDeckKeyword = "reclaim" | "fast";

function costBandOf(card: CardData): AuguryDeckCostBand {
  const cost = card.energyCost;
  if (cost === null) return "variable";
  if (cost <= 1) return "cheap";
  if (cost <= 3) return "mid";
  return "big";
}

function increment<Key extends string>(
  tally: Partial<Record<Key, number>>,
  key: Key,
): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

/** Tallies the deck's card-type / subtype / cost-band / keyword features. */
export function deckFeatureTallies(
  cards: readonly CardData[],
): AuguryDeckFeatureTallies {
  const cardType: Partial<Record<CardType, number>> = {};
  const subtype: Partial<Record<CardSubtype, number>> = {};
  const costBand: Partial<Record<AuguryDeckCostBand, number>> = {};
  const keyword: Partial<Record<AuguryDeckKeyword, number>> = {};
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
 * Builds the deck snapshot from a augury context. The `hash` covers each
 * entry's card number and modifications (transfiguration, type change, keyword
 * modification, Nightmare flag) sorted for stability, so two encounters scored
 * against the same deck content share a hash.
 */
export function buildAuguryDeckSnapshot(
  context: AuguryContext,
): AuguryDeckSnapshot {
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
    hash: parseStableDigest(sha256(hashInput)),
    features: deckFeatureTallies(cards),
  };
}
