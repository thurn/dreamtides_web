import type { StandardPlayingCard } from "../types/gamble";
import type { BlackjackGame } from "../types/gamble-data";

export type BlackjackOutcome = "player-win" | "dealer-win" | "push";

export interface BlackjackHandValue {
  total: number;
  isSoft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
}

export interface BlackjackDealerResolution {
  dealerCards: StandardPlayingCard[];
  deckCursor: number;
  outcome: BlackjackOutcome;
}

/** Best blackjack value, with enough Aces demoted from 11 to 1 to avoid busting. */
export function blackjackHandValue(
  cards: readonly StandardPlayingCard[],
  target: number,
): BlackjackHandValue {
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
  while (total > target && highAces > 0) {
    total -= 10;
    highAces -= 1;
  }
  return {
    total,
    isSoft: highAces > 0,
    isBlackjack: cards.length === 2 && total === target,
    isBust: total > target,
  };
}

export function blackjackHandTotal(
  cards: readonly StandardPlayingCard[],
  target: number,
): number {
  return blackjackHandValue(cards, target).total;
}

/** Enhanced Gamble sites discount the one up-front wager. */
export function blackjackWagerCost(
  config: BlackjackGame["economy"],
  isFarpoint: boolean,
): number {
  return isFarpoint ? config.enhancedWager : config.standardWager;
}

/** A natural resolves before either side takes a turn. */
export function blackjackOpeningOutcome(
  playerCards: readonly StandardPlayingCard[],
  dealerCards: readonly StandardPlayingCard[],
  target: number,
): BlackjackOutcome | null {
  const playerBlackjack = blackjackHandValue(playerCards, target).isBlackjack;
  const dealerBlackjack = blackjackHandValue(dealerCards, target).isBlackjack;
  if (playerBlackjack && dealerBlackjack) return "push";
  if (playerBlackjack) return "player-win";
  if (dealerBlackjack) return "dealer-win";
  return null;
}

/** Reveal the hole card, draw until 17, stand on soft 17, then compare hands. */
export function resolveBlackjackDealer(
  playerCards: readonly StandardPlayingCard[],
  initialDealerCards: readonly StandardPlayingCard[],
  committedDeck: readonly StandardPlayingCard[],
  initialDeckCursor: number,
  rules: Pick<BlackjackGame["rules"], "target" | "dealerStandThreshold">,
): BlackjackDealerResolution | null {
  const playerValue = blackjackHandValue(playerCards, rules.target);
  if (playerValue.isBust) {
    return {
      dealerCards: [...initialDealerCards],
      deckCursor: initialDeckCursor,
      outcome: "dealer-win",
    };
  }

  const dealerCards = [...initialDealerCards];
  let deckCursor = initialDeckCursor;
  while (
    blackjackHandValue(dealerCards, rules.target).total <
    rules.dealerStandThreshold
  ) {
    const card = committedDeck[deckCursor];
    if (card === undefined) return null;
    dealerCards.push(card);
    deckCursor += 1;
  }

  const dealerValue = blackjackHandValue(dealerCards, rules.target);
  const outcome =
    dealerValue.isBust || playerValue.total > dealerValue.total
      ? "player-win"
      : playerValue.total < dealerValue.total
        ? "dealer-win"
        : "push";
  return { dealerCards, deckCursor, outcome };
}

/** Player-win prize, push refund, or zero on a dealer win. */
export function blackjackEssenceAward(
  wagerCost: number,
  prizeEssence: number,
  outcome: BlackjackOutcome,
): number {
  if (outcome === "player-win") return prizeEssence;
  if (outcome === "push") return wagerCost;
  return 0;
}
