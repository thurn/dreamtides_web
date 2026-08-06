import { describe, expect, it } from "vitest";
import {
  rankBustsStarwayStairsTier,
  STARWAY_STAIRS_TIERS,
  starwayStairsBustRangeLabel,
  starwayStairsDrawTargetLabel,
  starwayStairsEssenceReward,
  starwayStairsWagerAmount,
} from "./starway-stairs";

describe("Starway Stairs rules", () => {
  const economy = {
    standardWager: 31,
    enhancedWager: 19,
    tiers: [
      { tier: 1 as const, essenceReward: 67 },
      { tier: 2 as const, essenceReward: 149 },
      { tier: 3 as const, essenceReward: 313 },
    ],
  };
  it("defines the three escalating bust ranges and rewards", () => {
    expect(starwayStairsWagerAmount(economy, false)).toBe(31);
    expect(starwayStairsWagerAmount(economy, true)).toBe(19);
    expect(
      STARWAY_STAIRS_TIERS.map((tier) => ({
        tierNumber: tier.tierNumber,
        bustRange: starwayStairsBustRangeLabel(tier),
        drawTarget: starwayStairsDrawTargetLabel(tier),
        reward: starwayStairsEssenceReward(economy, tier.tierNumber),
      })),
    ).toEqual([
      { tierNumber: 1, bustRange: "2", drawTarget: "3-A", reward: 67 },
      { tierNumber: 2, bustRange: "2-4", drawTarget: "5-A", reward: 149 },
      { tierNumber: 3, bustRange: "2-7", drawTarget: "8-A", reward: 313 },
    ]);
  });

  it("uses inclusive low-rank bust ranges for every tier", () => {
    expect(rankBustsStarwayStairsTier("2", 1)).toBe(true);
    expect(rankBustsStarwayStairsTier("3", 1)).toBe(false);
    expect(rankBustsStarwayStairsTier("4", 2)).toBe(true);
    expect(rankBustsStarwayStairsTier("5", 2)).toBe(false);
    expect(rankBustsStarwayStairsTier("7", 3)).toBe(true);
    expect(rankBustsStarwayStairsTier("8", 3)).toBe(false);
  });
});
