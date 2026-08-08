import { describe, expect, it } from "vitest";
import type { StandardPlayingCard } from "../types/gamble";
import {
  resolveBlackjackDealer,
  blackjackEssenceAward,
  blackjackHandValue,
  blackjackOpeningOutcome,
  blackjackWagerCost,
} from "./blackjack";

function card(rank: StandardPlayingCard["rank"]): StandardPlayingCard {
  return { rank, suit: "spades" };
}

describe("Blackjack rules", () => {
  it("values soft hands and natural blackjacks", () => {
    expect(blackjackHandValue([card("A"), card("K")], 21)).toEqual({
      total: 21,
      isSoft: true,
      isBlackjack: true,
      isBust: false,
    });
    expect(
      blackjackHandValue([card("A"), card("A"), card("9")], 21),
    ).toMatchObject({
      total: 21,
      isSoft: true,
      isBlackjack: false,
    });
    expect(
      blackjackHandValue([card("A"), card("A"), card("K")], 21),
    ).toMatchObject({
      total: 12,
      isSoft: false,
      isBust: false,
    });
  });

  it("resolves player, dealer, and shared natural blackjacks", () => {
    expect(
      blackjackOpeningOutcome(
        [card("A"), card("K")],
        [card("10"), card("9")],
        21,
      ),
    ).toBe("player-win");
    expect(
      blackjackOpeningOutcome(
        [card("10"), card("9")],
        [card("A"), card("Q")],
        21,
      ),
    ).toBe("dealer-win");
    expect(
      blackjackOpeningOutcome(
        [card("A"), card("K")],
        [card("A"), card("Q")],
        21,
      ),
    ).toBe("push");
  });

  it("draws the dealer through 16, stands on soft 17, and compares hands", () => {
    expect(
      resolveBlackjackDealer(
        [card("10"), card("9")],
        [card("10"), card("6")],
        [card("5")],
        0,
        { target: 21, dealerStandThreshold: 17 },
      ),
    ).toEqual({
      dealerCards: [card("10"), card("6"), card("5")],
      deckCursor: 1,
      outcome: "dealer-win",
    });
    expect(
      resolveBlackjackDealer(
        [card("10"), card("8")],
        [card("A"), card("6")],
        [card("4")],
        0,
        { target: 21, dealerStandThreshold: 17 },
      ),
    ).toEqual({
      dealerCards: [card("A"), card("6")],
      deckCursor: 0,
      outcome: "player-win",
    });
  });

  it("uses one enhanced wager discount and one flat prize", () => {
    const config = {
      kind: "blackjack" as const,
      standardWager: 90,
      enhancedWager: 40,
      prizeEssence: 300,
    };
    expect(blackjackWagerCost(config, false)).toBe(90);
    expect(blackjackWagerCost(config, true)).toBe(40);
    expect(blackjackEssenceAward(50, 300, "player-win")).toBe(300);
    expect(blackjackEssenceAward(50, 300, "push")).toBe(50);
    expect(blackjackEssenceAward(50, 300, "dealer-win")).toBe(0);
  });
});
