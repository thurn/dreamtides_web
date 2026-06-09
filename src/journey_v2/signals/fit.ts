import {
  scoreCandidatesForDeck,
  type CandidateFitScore,
  type FitModel,
} from "../../draft/replay/fit-model";
import type { CardData } from "../../types/cards";
import type { MerchantDeckCard } from "../types";

export type { CandidateFitScore };

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Score a set of candidate cards against a deck, returning a UUID-keyed map.
 *
 * This is a thin UUID-keyed wrapper over {@link scoreCandidatesForDeck}.
 * Candidates that are unknown to the fit model (no name mapping) are absent
 * from the returned map.
 *
 * @param candidates Cards to score.
 * @param deck The player's current deck.
 * @param fitModel The model from {@link buildFitModel}.
 */
export function fitScores(
  candidates: readonly CardData[],
  deck: readonly CardData[],
  fitModel: FitModel,
): Map<string, CandidateFitScore> {
  const candidateNumbers = candidates.map((c) => c.cardNumber);
  const deckNumbers = deck.map((c) => c.cardNumber);

  const byNumber = scoreCandidatesForDeck(candidateNumbers, deckNumbers, fitModel);

  // Build a lookup from cardNumber -> UUID from the candidate list (first seen wins)
  const numberToUuid = new Map<number, string>();
  for (const card of candidates) {
    if (!numberToUuid.has(card.cardNumber)) {
      numberToUuid.set(card.cardNumber, card.id);
    }
  }

  const result = new Map<string, CandidateFitScore>();
  for (const [cardNumber, score] of byNumber) {
    const uuid = numberToUuid.get(cardNumber);
    if (uuid !== undefined) {
      result.set(uuid, score);
    }
  }
  return result;
}

/**
 * Leave-one-out fit per deck entry.
 *
 * For each deck entry, computes the mean `coocNorm[other][card]` over all
 * other distinct cards in the deck. This measures how well the card fits
 * with its teammates — entries that rarely co-occur with the rest of the
 * deck score low (misfit candidates).
 *
 * Entries whose card has df < `fitModel.tuning.minDf` are **absent** from
 * the returned map. Cards below this threshold have no corpus signal, so
 * calling them "weak" would be a false judgment.
 *
 * @param deckCards The player's deck entries with their card data.
 * @param fitModel The model from {@link buildFitModel}.
 * @returns A Map from entryId to leave-one-out co-occurrence score.
 */
export function fitLooByEntry(
  deckCards: readonly MerchantDeckCard[],
  fitModel: FitModel,
): Map<string, number> {
  const { numberToName, coocNorm, idf } = fitModel;

  // Collect all deck card names for the co-occurrence computation
  const deckNamesList: Array<string | undefined> = deckCards.map((dc) =>
    numberToName.get(dc.cardNumber),
  );

  const result = new Map<string, number>();

  for (let i = 0; i < deckCards.length; i += 1) {
    const entry = deckCards[i];
    const cardName = deckNamesList[i];

    // Skip if card is unknown to the model
    if (cardName === undefined) continue;

    // Skip if card has idf=0 (filtered out due to df < minDf or df > maxDfFrac)
    const cardIdf = idf.get(cardName);
    if (cardIdf === undefined || cardIdf === 0) continue;

    // Collect distinct other card names (deduplicated)
    const seen = new Set<string>();
    const otherNames: string[] = [];
    for (let j = 0; j < deckCards.length; j += 1) {
      if (j === i) continue;
      const otherName = deckNamesList[j];
      if (otherName !== undefined && !seen.has(otherName) && otherName !== cardName) {
        seen.add(otherName);
        otherNames.push(otherName);
      }
    }

    if (otherNames.length === 0) {
      // Only card in the deck; co-occurrence is 0
      result.set(entry.entryId, 0);
      continue;
    }

    // The spec says: "mean over other distinct deck cards d of coocNorm[d][c]"
    // For each other deck card d, look up coocNorm[d][c] — how much c co-occurs
    // with d from d's perspective. Sum and divide.
    let sum = 0;
    for (const other of otherNames) {
      sum += coocNorm.get(other)?.get(cardName) ?? 0;
    }

    result.set(entry.entryId, sum / otherNames.length);
  }

  return result;
}

/**
 * Centrality of a card with respect to the current deck.
 *
 * When a fit model is available and has signal for the card:
 *   `clamp01(0.65 * prior + 0.35 * cooccur)`
 * where `prior` and `cooccur` are the raw (not normalized) components from
 * {@link scoreCandidatesForDeck} for this card alone against the deck.
 *
 * Fallback (no model, or no signal for the card):
 *   `0.25 + (spark >= 3 ? 0.15 : 0)`
 *
 * @param card The card to compute centrality for.
 * @param deck The player's current deck.
 * @param fitModel The fit model, or undefined for the fallback.
 */
export function centrality(
  card: CardData,
  deck: readonly CardData[],
  fitModel: FitModel | undefined,
): number {
  if (fitModel !== undefined) {
    const deckNumbers = deck.map((c) => c.cardNumber);
    const scored = scoreCandidatesForDeck([card.cardNumber], deckNumbers, fitModel);
    const score = scored.get(card.cardNumber);
    if (score !== undefined && (score.prior > 0 || score.cooccur > 0)) {
      return clamp01(0.65 * score.prior + 0.35 * score.cooccur);
    }
  }
  // Fallback: no model or no signal
  const spark = card.spark;
  return 0.25 + (spark !== null && spark >= 3 ? 0.15 : 0);
}
