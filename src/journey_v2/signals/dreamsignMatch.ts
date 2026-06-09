import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { CardData } from "../../types/cards";

/** Minimum number of deck cards that must exhibit a feature to satisfy it. */
const FEATURE_THRESHOLD = 3;

/** Quality weight: 1.2 / 1.0 / 0.8 for quality tiers 1 / 2 / 3. */
function qualityWeight(quality: 1 | 2 | 3): number {
  if (quality === 1) return 1.2;
  if (quality === 3) return 0.8;
  return 1.0;
}

/**
 * Returns true if the card matches the given cost band.
 * cheap: energyCost <= 1, mid: energyCost 2–3, big: energyCost >= 4.
 * Cards with null energyCost (variable cost) are excluded from band matching.
 */
function matchesCostBand(card: CardData, band: "cheap" | "mid" | "big"): boolean {
  const cost = card.energyCost;
  if (cost === null) return false;
  if (band === "cheap") return cost <= 1;
  if (band === "mid") return cost >= 2 && cost <= 3;
  // big
  return cost >= 4;
}

/**
 * Returns true if the card has the given keyword:
 * - "reclaim": card has a reclaimCost that is not null/undefined
 * - "fast": card.isFast is true
 */
function matchesKeyword(card: CardData, keyword: string): boolean {
  if (keyword === "reclaim") return card.reclaimCost !== undefined && card.reclaimCost !== null;
  if (keyword === "fast") return card.isFast;
  return false;
}

/**
 * Counts the number of deck cards satisfying the given feature predicate.
 */
function countSatisfying(deckCards: readonly CardData[], predicate: (c: CardData) => boolean): number {
  let count = 0;
  for (const card of deckCards) {
    if (predicate(card)) count += 1;
  }
  return count;
}

/**
 * Computes the match score for a dreamsign profile against the player's deck.
 *
 * Each profile feature (subtype, cardType, costBand, keyword) is satisfied when
 * >= 3 deck cards exhibit it. The score is:
 *   `(0.5 + 0.5 * satisfiedFraction) * qualityWeight`
 *
 * A profile with no features (or an undefined profile) scores as featureless
 * quality 2: `0.5 * 1.0 = 0.5`.
 *
 * @param profile The dreamsign profile, or undefined for featureless quality-2 behavior.
 * @param deckCards The player's current deck.
 */
export function dreamsignMatchScore(
  profile: DreamsignProfile | undefined,
  deckCards: readonly CardData[],
): number {
  // Undefined profile: featureless quality 2
  if (profile === undefined) {
    return 0.5 * qualityWeight(2);
  }

  const weight = qualityWeight(profile.quality);

  // Collect all features from the profile
  const features: Array<(c: CardData) => boolean> = [];

  for (const subtype of profile.subtypes) {
    features.push((c) => c.subtype === subtype);
  }

  for (const cardType of profile.cardTypes) {
    features.push((c) => c.cardType === cardType);
  }

  for (const band of profile.costBands) {
    features.push((c) => matchesCostBand(c, band));
  }

  for (const keyword of profile.keywords) {
    features.push((c) => matchesKeyword(c, keyword));
  }

  // No features: featureless score
  if (features.length === 0) {
    return 0.5 * weight;
  }

  // Count satisfied features
  let satisfied = 0;
  for (const predicate of features) {
    if (countSatisfying(deckCards, predicate) >= FEATURE_THRESHOLD) {
      satisfied += 1;
    }
  }

  const satisfiedFraction = satisfied / features.length;
  return (0.5 + 0.5 * satisfiedFraction) * weight;
}
