import { describe, expect, it } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import type { StandardPlayingCard } from "../types/gamble";
import {
  resolveTwentyOneDealer,
  twentyOneEssenceAward,
  twentyOneHandValue,
  twentyOneOpeningOutcome,
  twentyOneWagerCost,
} from "./twenty-one";

function card(rank: StandardPlayingCard["rank"]): StandardPlayingCard {
  return { rank, suit: "spades" };
}

describe("Twenty-One rules", () => {
  it("values soft hands and natural blackjacks", () => {
    expect(twentyOneHandValue([card("A"), card("K")])).toEqual({
      total: 21,
      isSoft: true,
      isBlackjack: true,
      isBust: false,
    });
    expect(twentyOneHandValue([card("A"), card("A"), card("9")])).toMatchObject({
      total: 21,
      isSoft: true,
      isBlackjack: false,
    });
    expect(twentyOneHandValue([card("A"), card("A"), card("K")])).toMatchObject({
      total: 12,
      isSoft: false,
      isBust: false,
    });
  });

  it("resolves player, dealer, and shared natural blackjacks", () => {
    expect(twentyOneOpeningOutcome(
      [card("A"), card("K")],
      [card("10"), card("9")],
    )).toBe("player-win");
    expect(twentyOneOpeningOutcome(
      [card("10"), card("9")],
      [card("A"), card("Q")],
    )).toBe("dealer-win");
    expect(twentyOneOpeningOutcome(
      [card("A"), card("K")],
      [card("A"), card("Q")],
    )).toBe("push");
  });

  it("draws the dealer through 16, stands on soft 17, and compares hands", () => {
    expect(resolveTwentyOneDealer(
      [card("10"), card("9")],
      [card("10"), card("6")],
      [card("5")],
      0,
    )).toEqual({ dealerCards: [card("10"), card("6"), card("5")], deckCursor: 1, outcome: "dealer-win" });
    expect(resolveTwentyOneDealer(
      [card("10"), card("8")],
      [card("A"), card("6")],
      [card("4")],
      0,
    )).toEqual({ dealerCards: [card("A"), card("6")], deckCursor: 0, outcome: "player-win" });
  });

  it("uses one enhanced wager discount and one flat prize", () => {
    const config = economyFixture().gamble.twentyOne;
    expect(twentyOneWagerCost(config, false)).toBe(50);
    expect(twentyOneWagerCost(config, true)).toBe(40);
    expect(twentyOneEssenceAward(50, 300, "player-win")).toBe(300);
    expect(twentyOneEssenceAward(50, 300, "push")).toBe(50);
    expect(twentyOneEssenceAward(50, 300, "dealer-win")).toBe(0);
  });
});
