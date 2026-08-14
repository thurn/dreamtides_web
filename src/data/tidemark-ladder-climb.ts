import {
  addTideIds,
  cosineAffinity,
  rarityStrength,
  type TideAffinityIndex,
  type TideVector,
} from "../selection/tide-affinity";
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
import type { LadderClimbGame } from "../types/gamble-data";
export type TidemarkLadderClimbAttemptRule =
  LadderClimbGame["rules"]["attempts"][number];

export function tidemarkLadderClimbAttemptRule(
  config: LadderClimbGame["rules"],
  attemptNumber: TidemarkLadderClimbAttemptNumber,
): TidemarkLadderClimbAttemptRule {
  return config.attempts[attemptNumber - 1];
}

export function tidemarkLadderClimbAttemptCost(
  config: LadderClimbGame["economy"],
  attemptNumber: TidemarkLadderClimbAttemptNumber,
  isFarpoint: boolean,
): number {
  const rule = config.attempts[attemptNumber - 1];
  return isFarpoint ? rule.enhancedCost : rule.standardCost;
}

/** The next attempt the current result state permits, if play may continue. */
export function nextTidemarkLadderClimbAttemptNumber(
  config: LadderClimbGame["rules"],
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
  config: LadderClimbGame["rules"],
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
  affinityIndex: TideAffinityIndex;
  affinityContext: TideVector;
}): TidemarkLadderClimbDreamsignCandidateScore[] {
  return params.templates
    .map((template) => {
      const vector = new Map<import("../types/identifiers").TideId, number>();
      addTideIds(vector, template.tideIds ?? []);
      return {
        dreamsignId: template.id,
        score: cosineAffinity(vector, params.affinityContext),
        rarity: rarityStrength(template.rarity),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.rarity - left.rarity ||
        compareUuid(left.dreamsignId, right.dreamsignId),
    )
    .map(({ dreamsignId, score }) => ({ dreamsignId, score }));
}
