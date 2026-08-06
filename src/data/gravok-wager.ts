import type {
  GravokGateId,
  StandardPlayingCard,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
} from "../types/gamble";

export const GRAVOK_WAGER_RULES_VERSION = "three-gate-v2";
export const GRAVOK_WAGER_ORDINARY_COST = 50;
export const GRAVOK_WAGER_FARPOINT_COST = 45;
export const GRAVOK_WAGER_MAX_RETRIES = 2;

export function gravokWagerCost(isFarpoint: boolean): number {
  return isFarpoint
    ? GRAVOK_WAGER_FARPOINT_COST
    : GRAVOK_WAGER_ORDINARY_COST;
}

export interface GravokGateRule {
  id: GravokGateId;
  name: string;
  threshold: StandardPlayingCardRank;
  oddsNumerator: number;
  oddsDenominator: number;
  essenceReward: number;
  awardsDreamsign: boolean;
}

/** Stable player-facing and rules-layer definitions for the three gates. */
export const GRAVOK_GATE_RULES: readonly GravokGateRule[] = [
  {
    id: "six",
    name: "Six Gate",
    threshold: "6",
    oddsNumerator: 36,
    oddsDenominator: 52,
    essenceReward: 100,
    awardsDreamsign: false,
  },
  {
    id: "nine",
    name: "Nine Gate",
    threshold: "9",
    oddsNumerator: 24,
    oddsDenominator: 52,
    essenceReward: 150,
    awardsDreamsign: false,
  },
  {
    id: "jack",
    name: "Jack Gate",
    threshold: "J",
    oddsNumerator: 16,
    oddsDenominator: 52,
    essenceReward: 200,
    awardsDreamsign: true,
  },
];

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

export function gravokGateRule(gateId: GravokGateId): GravokGateRule {
  return GRAVOK_GATE_RULES.find((gate) => gate.id === gateId)!;
}

/** Format a gate's authoritative fraction as the two-decimal UI percentage. */
export function gravokGateChanceLabel(gate: GravokGateRule): string {
  return `${((gate.oddsNumerator / gate.oddsDenominator) * 100).toFixed(2)}%`;
}

/** Whether a drawn rank crosses a gate's inclusive threshold. */
export function rankWinsGravokGate(
  rank: StandardPlayingCardRank,
  gateId: GravokGateId,
): boolean {
  return (
    STANDARD_PLAYING_CARD_RANKS.indexOf(rank) >=
    STANDARD_PLAYING_CARD_RANKS.indexOf(gravokGateRule(gateId).threshold)
  );
}
