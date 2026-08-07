import type {
  StandardPlayingCardRank,
  StarwayStairsTierNumber,
} from "../types/gamble";
import type { StarwayStairsSiteRuntime } from "../types/journey";
import { STANDARD_PLAYING_CARD_RANKS } from "./gravok-wager";
import type { EconomyData } from "../types/economy-data";
import type { SitesData } from "../types/sites-data";

export const STARWAY_STAIRS_RULES_VERSION = "starway-stairs-v4";

export function starwayStairsWagerAmount(
  config: EconomyData["gamble"]["starwayStairs"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedWager : config.standardWager;
}

export type StarwayStairsTierRule =
  SitesData["gamble"]["starwayStairs"]["tiers"][number];

export function starwayStairsTierRule(
  config: SitesData["gamble"]["starwayStairs"],
  tierNumber: StarwayStairsTierNumber,
): StarwayStairsTierRule {
  return config.tiers[tierNumber - 1];
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
    throw new Error(`Starway tier ${String(tier.tier)} has no safe rank`);
  }
  return `${minimumSafeRank}-A`;
}

/** Whether the drawn rank busts the specified tier. */
export function rankBustsStarwayStairsTier(
  config: SitesData["gamble"]["starwayStairs"],
  rank: StandardPlayingCardRank,
  tierNumber: StarwayStairsTierNumber,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) <=
    STANDARD_PLAYING_CARD_RANKS.indexOf(
      starwayStairsTierRule(config, tierNumber).highestBustRank,
    )
  );
}

/** The next tier that can be drawn from the persisted game state. */
export function nextStarwayStairsTierNumber(
  config: SitesData["gamble"]["starwayStairs"],
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
  return config.tiers[runtime.results.length]?.tier ?? null;
}
