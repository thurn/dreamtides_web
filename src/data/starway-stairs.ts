import type {
  StandardPlayingCardRank,
  StarwayStairsTierNumber,
} from "../types/gamble";
import type { StarwayStairsSiteRuntime } from "../types/journey";
import { STANDARD_PLAYING_CARD_RANKS } from "./gravok-wager";
import type { EconomyData } from "../types/economy-data";

export const STARWAY_STAIRS_RULES_VERSION = "starway-stairs-v4";
export const STARWAY_STAIRS_MAX_RETRIES = 2;

export function starwayStairsWagerAmount(config: EconomyData["gamble"]["starwayStairs"], isFarpoint: boolean): number {
  return isFarpoint ? config.enhancedWager : config.standardWager;
}

export interface StarwayStairsTierRule {
  tierNumber: StarwayStairsTierNumber;
  highestBustRank: StandardPlayingCardRank;
  bustOddsNumerator: number;
  oddsDenominator: number;
}

/** Stable bust ranges and rewards for the three Starway Stairs tiers. */
export const STARWAY_STAIRS_TIERS: readonly StarwayStairsTierRule[] = [
  {
    tierNumber: 1,
    highestBustRank: "2",
    bustOddsNumerator: 4,
    oddsDenominator: 52,
  },
  {
    tierNumber: 2,
    highestBustRank: "4",
    bustOddsNumerator: 12,
    oddsDenominator: 52,
  },
  {
    tierNumber: 3,
    highestBustRank: "7",
    bustOddsNumerator: 24,
    oddsDenominator: 52,
  },
];

export function starwayStairsTierRule(
  tierNumber: StarwayStairsTierNumber,
): StarwayStairsTierRule {
  return STARWAY_STAIRS_TIERS[tierNumber - 1];
}

export function starwayStairsEssenceReward(
  config: EconomyData["gamble"]["starwayStairs"],
  tierNumber: StarwayStairsTierNumber,
): number {
  return config.tiers[tierNumber - 1].essenceReward;
}

/** Format the inclusive low-rank bust range shown on a Starway tier. */
export function starwayStairsBustRangeLabel(
  tier: StarwayStairsTierRule,
): string {
  return tier.highestBustRank === "2" ? "2" : `2-${tier.highestBustRank}`;
}

/** Inclusive safe-draw range shown on a Starway tier prize. */
export function starwayStairsDrawTargetLabel(
  tier: StarwayStairsTierRule,
): string {
  const bustIndex = STANDARD_PLAYING_CARD_RANKS.indexOf(tier.highestBustRank);
  const minimumSafeRank = STANDARD_PLAYING_CARD_RANKS[bustIndex + 1];
  if (minimumSafeRank === undefined) {
    throw new Error(`Starway tier ${String(tier.tierNumber)} has no safe rank`);
  }
  return `${minimumSafeRank}-A`;
}

/** Whether the drawn rank busts the specified tier. */
export function rankBustsStarwayStairsTier(
  rank: StandardPlayingCardRank,
  tierNumber: StarwayStairsTierNumber,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) <=
    STANDARD_PLAYING_CARD_RANKS.indexOf(
      starwayStairsTierRule(tierNumber).highestBustRank,
    )
  );
}

/** The next tier that can be drawn from the persisted game state. */
export function nextStarwayStairsTierNumber(
  runtime: Pick<StarwayStairsSiteRuntime, "results" | "terminalReason">,
): StarwayStairsTierNumber | null {
  if (runtime.terminalReason !== null) return null;
  const latestResult = runtime.results[runtime.results.length - 1];
  if (
    latestResult !== undefined &&
    (!latestResult.resultSettled || latestResult.busted)
  ) {
    return null;
  }
  return STARWAY_STAIRS_TIERS[runtime.results.length]?.tierNumber ?? null;
}
