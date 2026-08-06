import type {
  StandardPlayingCardRank,
  StarwayStairsTierNumber,
} from "../types/gamble";
import type { StarwayStairsSiteRuntime } from "../types/journey";
import { STANDARD_PLAYING_CARD_RANKS } from "./gravok-wager";

export const STARWAY_STAIRS_RULES_VERSION = "starway-stairs-v1";
export const STARWAY_STAIRS_ENTRY_COST = 10;

export interface StarwayStairsTierRule {
  tierNumber: StarwayStairsTierNumber;
  highestBustRank: StandardPlayingCardRank;
  bustOddsNumerator: number;
  oddsDenominator: number;
  essenceReward: number;
}

/** Stable bust ranges and rewards for the three Starway Stairs tiers. */
export const STARWAY_STAIRS_TIERS: readonly StarwayStairsTierRule[] = [
  {
    tierNumber: 1,
    highestBustRank: "2",
    bustOddsNumerator: 4,
    oddsDenominator: 52,
    essenceReward: 60,
  },
  {
    tierNumber: 2,
    highestBustRank: "4",
    bustOddsNumerator: 12,
    oddsDenominator: 52,
    essenceReward: 140,
  },
  {
    tierNumber: 3,
    highestBustRank: "7",
    bustOddsNumerator: 24,
    oddsDenominator: 52,
    essenceReward: 300,
  },
];

export function starwayStairsTierRule(
  tierNumber: StarwayStairsTierNumber,
): StarwayStairsTierRule {
  return STARWAY_STAIRS_TIERS[tierNumber - 1];
}

/** Format the inclusive low-rank bust range shown on a Starway tier. */
export function starwayStairsBustRangeLabel(
  tier: StarwayStairsTierRule,
): string {
  return tier.highestBustRank === "2" ? "2" : `2-${tier.highestBustRank}`;
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
