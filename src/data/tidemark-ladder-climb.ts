import type { DreamsignProfile } from "./dreamsign-profiles";
import { dreamsignMatchScore } from "../journey_v2/signals/dreamsignMatch";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type {
  StandardPlayingCardRank,
  TidemarkLadderClimbAttemptNumber,
} from "../types/gamble";
import type {
  TidemarkLadderClimbDreamsignCandidateScore,
  TidemarkLadderClimbSiteRuntime,
} from "../types/journey";
import { STANDARD_PLAYING_CARD_RANKS } from "./gravok-wager";

export const TIDEMARK_LADDER_CLIMB_RULES_VERSION = "tidemark-ladder-climb-v2";
export const TIDEMARK_STRONG_POOL_LIMIT = 50;
export const TIDEMARK_LADDER_CLIMB_ESSENCE_REWARD = 25;

export interface TidemarkLadderClimbAttemptRule {
  attemptNumber: TidemarkLadderClimbAttemptNumber;
  ordinaryCost: number;
  farpointCost: number;
  threshold: StandardPlayingCardRank;
  oddsNumerator: number;
  oddsDenominator: number;
}

/** Stable costs and inclusive rank thresholds for each ladder attempt. */
export const TIDEMARK_LADDER_CLIMB_ATTEMPTS: readonly TidemarkLadderClimbAttemptRule[] = [
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

export function tidemarkLadderClimbAttemptRule(
  attemptNumber: TidemarkLadderClimbAttemptNumber,
): TidemarkLadderClimbAttemptRule {
  return TIDEMARK_LADDER_CLIMB_ATTEMPTS[attemptNumber - 1];
}

export function tidemarkLadderClimbAttemptCost(
  attemptNumber: TidemarkLadderClimbAttemptNumber,
  isFarpoint: boolean,
): number {
  const rule = tidemarkLadderClimbAttemptRule(attemptNumber);
  return isFarpoint ? rule.farpointCost : rule.ordinaryCost;
}

/** The next attempt the current result state permits, if play may continue. */
export function nextTidemarkLadderClimbAttemptNumber(
  runtime: Pick<TidemarkLadderClimbSiteRuntime, "result" | "revealedCards">,
): TidemarkLadderClimbAttemptNumber | null {
  if (
    runtime.result !== null &&
    (!runtime.result.resultSettled ||
      runtime.result.won ||
      runtime.result.attemptNumber >= TIDEMARK_LADDER_CLIMB_ATTEMPTS.length)
  ) {
    return null;
  }
  return (
    TIDEMARK_LADDER_CLIMB_ATTEMPTS[runtime.revealedCards.length]
      ?.attemptNumber ?? null
  );
}

/** Whether a rank crosses the current attempt's inclusive threshold. */
export function rankWinsTidemarkLadderClimbAttempt(
  rank: StandardPlayingCardRank,
  attemptNumber: TidemarkLadderClimbAttemptNumber,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) >=
    STANDARD_PLAYING_CARD_RANKS.indexOf(
      tidemarkLadderClimbAttemptRule(attemptNumber).threshold,
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
export function scoreTidemarkLadderClimbDreamsignCandidates(params: {
  templates: readonly DreamsignTemplate[];
  profiles: ReadonlyMap<string, DreamsignProfile> | undefined;
  deckCards: readonly CardData[];
}): TidemarkLadderClimbDreamsignCandidateScore[] {
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
