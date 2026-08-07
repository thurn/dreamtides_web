import type { EconomyData } from "../types/economy-data";
import type { StandardPlayingCard } from "../types/gamble";

export const TWENTY_ONE_RULES_VERSION = "twenty-one-v1";
export const TWENTY_ONE_MAX_ROUNDS = 3;
export const TWENTY_ONE_DREAMSIGN_TOTAL = 21;

export type TwentyOneTerminalReason = "stood" | "twenty-one" | "bust";

export interface TwentyOneNextCardOdds {
  remainingCards: number;
  noReward: number;
  lowReward: number;
  highReward: number;
  dreamsign: number;
  bust: number;
}

/** Highest blackjack total at or below 21, with Aces demoted as needed. */
export function twentyOneHandTotal(
  cards: readonly StandardPlayingCard[],
): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

/** Essence award for a settled total. Busts and totals below 16 award zero. */
export function twentyOneEssenceReward(
  config: EconomyData["gamble"]["twentyOne"],
  total: number,
): number {
  if (total >= 19 && total <= 21) return config.highReward;
  if (total >= 16 && total <= 18) return config.lowReward;
  return 0;
}

export function twentyOneHitCost(
  config: EconomyData["gamble"]["twentyOne"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedHitCost : config.standardHitCost;
}

/** Classify every possible next draw from the exact remaining shoe. */
export function twentyOneNextCardOdds(
  hand: readonly StandardPlayingCard[],
  committedDeck: readonly StandardPlayingCard[],
  deckCursor: number,
): TwentyOneNextCardOdds {
  const odds: TwentyOneNextCardOdds = {
    remainingCards: Math.max(0, committedDeck.length - deckCursor),
    noReward: 0,
    lowReward: 0,
    highReward: 0,
    dreamsign: 0,
    bust: 0,
  };
  for (const card of committedDeck.slice(deckCursor)) {
    const total = twentyOneHandTotal([...hand, card]);
    if (total > 21) odds.bust += 1;
    else if (total === TWENTY_ONE_DREAMSIGN_TOTAL) odds.dreamsign += 1;
    else if (total >= 19) odds.highReward += 1;
    else if (total >= 16) odds.lowReward += 1;
    else odds.noReward += 1;
  }
  return odds;
}
