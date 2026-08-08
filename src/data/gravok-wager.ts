import type {
  GravokGateId,
  StandardPlayingCard,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
} from "../types/gamble";
import type { ThreeGateGame } from "../types/gamble-data";

export function gravokWagerCost(
  config: ThreeGateGame["economy"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedWager : config.standardWager;
}

export type GravokGateRule = ThreeGateGame["rules"]["gates"][number];

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
  config: ThreeGateGame["rules"],
  gateId: GravokGateId,
): GravokGateRule {
  const rule = config.gates.find((gate) => gate.gate === gateId);
  if (rule === undefined) throw new Error(`Missing configured gate ${gateId}`);
  return rule;
}

export function gravokGateEssenceReward(
  config: ThreeGateGame["economy"],
  gateId: GravokGateId,
): number {
  const reward = config.rewards.find((candidate) => candidate.gate === gateId);
  if (reward === undefined)
    throw new Error(`Missing configured gate reward ${gateId}`);
  return reward.essence;
}

/** Format a gate's authoritative fraction as the two-decimal UI percentage. */
export function gravokGateChanceLabel(
  game: ThreeGateGame,
  gate: GravokGateRule,
): string {
  return `${((gate.winningCardCount / game.rules.standardDeckSize) * 100).toFixed(2)}%`;
}

/** Whether a drawn rank crosses a gate's inclusive threshold. */
export function rankWinsGravokGate(
  config: ThreeGateGame["rules"],
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
