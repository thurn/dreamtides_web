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
import type { EconomyData } from "../types/economy-data";
import type { SitesData } from "../types/sites-data";

export const TIDEMARK_LADDER_CLIMB_RULES_VERSION = "tidemark-ladder-climb-v2";
export type TidemarkLadderClimbAttemptRule =
  SitesData["gamble"]["ladderClimb"]["attempts"][number];

export function tidemarkLadderClimbAttemptRule(
  config: SitesData["gamble"]["ladderClimb"],
  attemptNumber: TidemarkLadderClimbAttemptNumber,
): TidemarkLadderClimbAttemptRule {
  return config.attempts[attemptNumber - 1];
}

export function tidemarkLadderClimbAttemptCost(
  config: EconomyData["gamble"]["ladderClimb"],
  attemptNumber: TidemarkLadderClimbAttemptNumber,
  isFarpoint: boolean,
): number {
  const rule = config.attempts[attemptNumber - 1];
  return isFarpoint ? rule.enhancedCost : rule.standardCost;
}

/** The next attempt the current result state permits, if play may continue. */
export function nextTidemarkLadderClimbAttemptNumber(
  config: SitesData["gamble"]["ladderClimb"],
  runtime: Pick<TidemarkLadderClimbSiteRuntime, "result" | "revealedCards">,
): TidemarkLadderClimbAttemptNumber | null {
  if (
    runtime.result !== null &&
    (!runtime.result.resultSettled ||
      runtime.result.won ||
      runtime.result.attemptNumber >= config.attempts.length)
  ) {
    return null;
  }
  return config.attempts[runtime.revealedCards.length]?.attempt ?? null;
}

/** Whether a rank crosses the current attempt's inclusive threshold. */
export function rankWinsTidemarkLadderClimbAttempt(
  config: SitesData["gamble"]["ladderClimb"],
  rank: StandardPlayingCardRank,
  attemptNumber: TidemarkLadderClimbAttemptNumber,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) >=
    STANDARD_PLAYING_CARD_RANKS.indexOf(
      tidemarkLadderClimbAttemptRule(config, attemptNumber).threshold,
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
