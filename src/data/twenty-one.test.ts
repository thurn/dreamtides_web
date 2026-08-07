import { describe, expect, it } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import type { StandardPlayingCard } from "../types/gamble";
import {
  twentyOneEssenceReward,
  twentyOneHandTotal,
  twentyOneHitCost,
  twentyOneNextCardOdds,
} from "./twenty-one";

function card(rank: StandardPlayingCard["rank"]): StandardPlayingCard {
  return { rank, suit: "spades" };
}

describe("Twenty-One rules", () => {
  it("demotes as many Aces as needed to keep the best playable total", () => {
    expect(twentyOneHandTotal([card("A"), card("K")])).toBe(21);
    expect(twentyOneHandTotal([card("A"), card("A"), card("9")])).toBe(21);
    expect(twentyOneHandTotal([card("A"), card("A"), card("K")])).toBe(12);
  });

  it("maps terminal totals to the low, high, and Dreamsign reward bands", () => {
    const config = economyFixture().gamble.twentyOne;
    expect([15, 16, 18, 19, 20, 21, 22].map((total) =>
      twentyOneEssenceReward(config, total)
    )).toEqual([0, 55, 55, 150, 150, 150, 0]);
    expect(twentyOneHitCost(config, false)).toBe(10);
    expect(twentyOneHitCost(config, true)).toBe(0);
  });

  it("counts exact next-card outcomes from the remaining committed shoe", () => {
    const deck = [card("A"), card("2"), card("6"), card("7"), card("10")];
    expect(twentyOneNextCardOdds([card("10"), card("5")], deck, 1)).toEqual({
      remainingCards: 4,
      noReward: 0,
      lowReward: 1,
      highReward: 0,
      dreamsign: 1,
      bust: 2,
    });
  });
});
