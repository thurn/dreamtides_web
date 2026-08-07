import type { EconomyData } from "../types/economy-data";
import type { StandardPlayingCard } from "../types/gamble";

export const TWENTY_ONE_RULES_VERSION = "twenty-one-v2";

export type TwentyOneOutcome = "player-win" | "dealer-win" | "push";

export interface TwentyOneHandValue {
  total: number;
  isSoft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
}

export interface TwentyOneDealerResolution {
  dealerCards: StandardPlayingCard[];
  deckCursor: number;
  outcome: TwentyOneOutcome;
}

/** Best blackjack value, with enough Aces demoted from 11 to 1 to avoid busting. */
export function twentyOneHandValue(
  cards: readonly StandardPlayingCard[],
): TwentyOneHandValue {
  let total = 0;
  let highAces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      total += 11;
      highAces += 1;
    } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && highAces > 0) {
    total -= 10;
    highAces -= 1;
  }
  return {
    total,
    isSoft: highAces > 0,
    isBlackjack: cards.length === 2 && total === 21,
    isBust: total > 21,
  };
}

export function twentyOneHandTotal(
  cards: readonly StandardPlayingCard[],
): number {
  return twentyOneHandValue(cards).total;
}

/** Enhanced Gamble sites discount the one up-front wager. */
export function twentyOneWagerCost(
  config: EconomyData["gamble"]["twentyOne"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedWager : config.standardWager;
}

/** A natural resolves before either side takes a turn. */
export function twentyOneOpeningOutcome(
  playerCards: readonly StandardPlayingCard[],
  dealerCards: readonly StandardPlayingCard[],
): TwentyOneOutcome | null {
  const playerBlackjack = twentyOneHandValue(playerCards).isBlackjack;
  const dealerBlackjack = twentyOneHandValue(dealerCards).isBlackjack;
  if (playerBlackjack && dealerBlackjack) return "push";
  if (playerBlackjack) return "player-win";
  if (dealerBlackjack) return "dealer-win";
  return null;
}

/** Reveal the hole card, draw until 17, stand on soft 17, then compare hands. */
export function resolveTwentyOneDealer(
  playerCards: readonly StandardPlayingCard[],
  initialDealerCards: readonly StandardPlayingCard[],
  committedDeck: readonly StandardPlayingCard[],
  initialDeckCursor: number,
): TwentyOneDealerResolution | null {
  const playerValue = twentyOneHandValue(playerCards);
  if (playerValue.isBust) {
    return {
      dealerCards: [...initialDealerCards],
      deckCursor: initialDeckCursor,
      outcome: "dealer-win",
    };
  }

  const dealerCards = [...initialDealerCards];
  let deckCursor = initialDeckCursor;
  while (twentyOneHandValue(dealerCards).total < 17) {
    const card = committedDeck[deckCursor];
    if (card === undefined) return null;
    dealerCards.push(card);
    deckCursor += 1;
  }

  const dealerValue = twentyOneHandValue(dealerCards);
  const outcome = dealerValue.isBust || playerValue.total > dealerValue.total
    ? "player-win"
    : playerValue.total < dealerValue.total
      ? "dealer-win"
      : "push";
  return { dealerCards, deckCursor, outcome };
}

/** Player-win prize, push refund, or zero on a dealer win. */
export function twentyOneEssenceAward(
  wagerCost: number,
  prizeEssence: number,
  outcome: TwentyOneOutcome,
): number {
  if (outcome === "player-win") return prizeEssence;
  if (outcome === "push") return wagerCost;
  return 0;
}
