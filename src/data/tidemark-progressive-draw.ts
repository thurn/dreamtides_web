import type { DreamsignProfile } from "./dreamsign-profiles";
import { dreamsignMatchScore } from "../journey_v2/signals/dreamsignMatch";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type {
  StandardPlayingCardRank,
  TidemarkProgressiveAttemptNumber,
} from "../types/gamble";
import type {
  TidemarkDreamsignCandidateScore,
  TidemarkProgressiveSiteRuntime,
} from "../types/journey";
import { STANDARD_PLAYING_CARD_RANKS } from "./gravok-wager";

export const TIDEMARK_PROGRESSIVE_RULES_VERSION = "tidemark-progressive-v1";
export const TIDEMARK_STRONG_POOL_LIMIT = 50;

export interface TidemarkProgressiveAttemptRule {
  attemptNumber: TidemarkProgressiveAttemptNumber;
  ordinaryCost: number;
  farpointCost: number;
  threshold: StandardPlayingCardRank;
  oddsNumerator: number;
  oddsDenominator: number;
}

/** Stable costs and inclusive rank thresholds for each progressive attempt. */
export const TIDEMARK_PROGRESSIVE_ATTEMPTS: readonly TidemarkProgressiveAttemptRule[] = [
  {
    attemptNumber: 1,
    ordinaryCost: 15,
    farpointCost: 10,
    threshold: "Q",
    oddsNumerator: 12,
    oddsDenominator: 52,
  },
  {
    attemptNumber: 2,
    ordinaryCost: 25,
    farpointCost: 20,
    threshold: "10",
    oddsNumerator: 20,
    oddsDenominator: 52,
  },
  {
    attemptNumber: 3,
    ordinaryCost: 40,
    farpointCost: 30,
    threshold: "8",
    oddsNumerator: 28,
    oddsDenominator: 52,
  },
  {
    attemptNumber: 4,
    ordinaryCost: 60,
    farpointCost: 45,
    threshold: "6",
    oddsNumerator: 36,
    oddsDenominator: 52,
  },
];

export function tidemarkAttemptRule(
  attemptNumber: TidemarkProgressiveAttemptNumber,
): TidemarkProgressiveAttemptRule {
  return TIDEMARK_PROGRESSIVE_ATTEMPTS[attemptNumber - 1];
}

export function tidemarkAttemptCost(
  attemptNumber: TidemarkProgressiveAttemptNumber,
  isFarpoint: boolean,
): number {
  const rule = tidemarkAttemptRule(attemptNumber);
  return isFarpoint ? rule.farpointCost : rule.ordinaryCost;
}

/** The next attempt the current result state permits, if play may continue. */
export function nextTidemarkAttemptNumber(
  runtime: Pick<TidemarkProgressiveSiteRuntime, "result" | "revealedCards">,
): TidemarkProgressiveAttemptNumber | null {
  if (
    runtime.result !== null &&
    (!runtime.result.resultSettled ||
      runtime.result.won ||
      runtime.result.attemptNumber >= TIDEMARK_PROGRESSIVE_ATTEMPTS.length)
  ) {
    return null;
  }
  return (
    TIDEMARK_PROGRESSIVE_ATTEMPTS[runtime.revealedCards.length]
      ?.attemptNumber ?? null
  );
}

/** Whether a rank crosses the current attempt's inclusive threshold. */
export function rankWinsTidemarkAttempt(
  rank: StandardPlayingCardRank,
  attemptNumber: TidemarkProgressiveAttemptNumber,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) >=
    STANDARD_PLAYING_CARD_RANKS.indexOf(
      tidemarkAttemptRule(attemptNumber).threshold,
    )
  );
}

function compareUuid(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Score every eligible Dreamsign against the current deck, ordered by the
 * strong-pool contract: descending match score with UUID as the tiebreaker.
 */
export function scoreTidemarkDreamsignCandidates(params: {
  templates: readonly DreamsignTemplate[];
  profiles: ReadonlyMap<string, DreamsignProfile> | undefined;
  deckCards: readonly CardData[];
}): TidemarkDreamsignCandidateScore[] {
  return params.templates
    .map((template) => ({
      dreamsignId: template.id,
      score: dreamsignMatchScore(
        params.profiles?.get(template.id),
        params.deckCards,
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareUuid(left.dreamsignId, right.dreamsignId),
    );
}
