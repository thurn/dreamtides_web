import type {
  GravokGateId,
  StandardPlayingCard,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
} from "../types/gamble";
import type { EconomyData } from "../types/economy-data";
import type { SitesData } from "../types/sites-data";

export const GRAVOK_WAGER_RULES_VERSION = "three-gate-v2";

export function gravokWagerCost(
  config: EconomyData["gamble"]["threeGate"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedWager : config.standardWager;
}

export type GravokGateRule = SitesData["gamble"]["threeGate"]["gates"][number];

export const STANDARD_PLAYING_CARD_RANKS: readonly StandardPlayingCardRank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export const STANDARD_PLAYING_CARD_SUITS: readonly StandardPlayingCardSuit[] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
];

/** Stable rank-major order for the standard 52-card deck. */
export const STANDARD_PLAYING_CARD_DECK: readonly StandardPlayingCard[] =
  STANDARD_PLAYING_CARD_RANKS.flatMap((rank) =>
    STANDARD_PLAYING_CARD_SUITS.map((suit) => ({ rank, suit })),
  );

export function gravokGateRule(
  config: SitesData["gamble"]["threeGate"],
  gateId: GravokGateId,
): GravokGateRule {
  const rule = config.gates.find((gate) => gate.id === gateId);
  if (rule === undefined) throw new Error(`Missing configured gate ${gateId}`);
  return rule;
}

export function gravokGateEssenceReward(
  config: EconomyData["gamble"]["threeGate"],
  gateId: GravokGateId,
): number {
  return config.rewards[gateId];
}

/** Format a gate's authoritative fraction as the two-decimal UI percentage. */
export function gravokGateChanceLabel(gate: GravokGateRule): string {
  return `${((gate.oddsNumerator / gate.oddsDenominator) * 100).toFixed(2)}%`;
}

/** Whether a drawn rank crosses a gate's inclusive threshold. */
export function rankWinsGravokGate(
  config: SitesData["gamble"]["threeGate"],
  rank: StandardPlayingCardRank,
  gateId: GravokGateId,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) >=
    STANDARD_PLAYING_CARD_RANKS.indexOf(
      gravokGateRule(config, gateId).threshold,
    )
  );
}
