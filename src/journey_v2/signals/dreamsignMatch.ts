import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { CardData } from "../../types/cards";

/**
 * Deck cards exhibiting a feature for it to count as *fully* covered. Coverage
 * grades linearly up to this count (one matching card already gives partial
 * credit), so a dreamsign keyed to a feature the deck genuinely supports rises
 * and one keyed to a feature the deck lacks falls to zero coverage.
 */
const FEATURE_FULL_COVERAGE = 3;

/**
 * Baseline coverage for a featureless (or unprofiled) dreamsign — one that
 * suits any deck equally. Pitched below a specific dreamsign whose features the
 * deck covers, and above one whose features the deck does not, so a generic
 * blessing is a reasonable fallback but never beats a genuinely suited sign.
 */
const FEATURELESS_COVERAGE = 0.4;

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
 * Coverage of a single feature: the fraction of the way to
 * {@link FEATURE_FULL_COVERAGE} matching deck cards, in [0, 1]. A feature the
 * deck has no cards for scores 0; three or more matching cards scores 1.
 */
function featureCoverage(
  deckCards: readonly CardData[],
  predicate: (c: CardData) => boolean,
): number {
  const count = countSatisfying(deckCards, predicate);
  return Math.min(1, count / FEATURE_FULL_COVERAGE);
}

/**
 * The deck coverage of a dreamsign profile, split out from quality weighting so
 * callers can distinguish *genuine deck fit* from a generic blessing.
 */
export interface DreamsignCoverage {
  /** Number of features the profile declares (0 for featureless/undefined). */
  featureCount: number;
  /** Mean graded coverage across features in [0, 1]; 0 when featureless. */
  meanCoverage: number;
}

/** The components behind a single dreamsign's match score, for explainability. */
export interface DreamsignScoreBreakdown {
  /** Final match score (`coverageBase * qualityWeight`). */
  score: number;
  /** Number of features the profile declares (0 for featureless/undefined). */
  featureCount: number;
  /** Mean graded coverage across features in [0, 1]; 0 when featureless. */
  meanCoverage: number;
  /** Quality weight applied (1.2 / 1.0 / 0.8 for quality tiers 1 / 2 / 3). */
  qualityWeight: number;
  /** True when the sign is featureless and rode the generic baseline coverage. */
  featureless: boolean;
}

/**
 * Mean graded coverage of a profile's features against the deck. Each feature
 * (subtype, cardType, costBand, keyword) contributes a graded coverage in
 * [0, 1] — zero when the deck holds no matching card, full at
 * {@link FEATURE_FULL_COVERAGE} matching cards — and the result is their mean.
 * A featureless or undefined profile has no features to measure
 * (`featureCount === 0`, `meanCoverage === 0`).
 */
function profileCoverage(
  profile: DreamsignProfile | undefined,
  deckCards: readonly CardData[],
): DreamsignCoverage {
  if (profile === undefined) {
    return { featureCount: 0, meanCoverage: 0 };
  }

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

  if (features.length === 0) {
    return { featureCount: 0, meanCoverage: 0 };
  }

  let coverageSum = 0;
  for (const predicate of features) {
    coverageSum += featureCoverage(deckCards, predicate);
  }
  return {
    featureCount: features.length,
    meanCoverage: coverageSum / features.length,
  };
}

/**
 * Computes the match score for a dreamsign profile against the player's deck.
 *
 * The score is `meanCoverage * qualityWeight`, so a dreamsign whose features the
 * deck does not support sinks toward zero (it can never be sold as "suited to
 * your deck"), while one the deck genuinely supports rises. A profile with no
 * features (or an undefined profile) is featureless: it suits any deck equally
 * and scores `FEATURELESS_COVERAGE * qualityWeight`.
 *
 * @param profile The dreamsign profile, or undefined for featureless behavior.
 * @param deckCards The player's current deck.
 */
export function dreamsignMatchScore(
  profile: DreamsignProfile | undefined,
  deckCards: readonly CardData[],
): number {
  return dreamsignScoreBreakdown(profile, deckCards).score;
}

/**
 * The full component breakdown behind {@link dreamsignMatchScore}, for trace
 * logging. The score is `coverageBase * qualityWeight`, where `coverageBase` is
 * {@link FEATURELESS_COVERAGE} for a featureless sign and the profile's
 * `meanCoverage` otherwise.
 */
export function dreamsignScoreBreakdown(
  profile: DreamsignProfile | undefined,
  deckCards: readonly CardData[],
): DreamsignScoreBreakdown {
  const weight = qualityWeight(profile?.quality ?? 2);
  const coverage = profileCoverage(profile, deckCards);
  const featureless = coverage.featureCount === 0;
  const coverageBase = featureless ? FEATURELESS_COVERAGE : coverage.meanCoverage;
  return {
    score: coverageBase * weight,
    featureCount: coverage.featureCount,
    meanCoverage: coverage.meanCoverage,
    qualityWeight: weight,
    featureless,
  };
}

/**
 * True when a dreamsign *genuinely shares a feature with the deck* — a profiled
 * sign with at least one feature and positive coverage. Returns false for
 * featureless/undefined signs (generic blessings that fit no deck in particular)
 * and for off-deck signs whose features the deck lacks. Use this to keep a
 * generic or off-archetype sign from being offered as "suited to your deck"
 * whenever a genuinely matching sign is available; {@link dreamsignMatchScore}
 * still ranks within the chosen pool.
 */
export function dreamsignHasDeckCoverage(
  profile: DreamsignProfile | undefined,
  deckCards: readonly CardData[],
): boolean {
  const coverage = profileCoverage(profile, deckCards);
  return coverage.featureCount > 0 && coverage.meanCoverage > 0;
}
