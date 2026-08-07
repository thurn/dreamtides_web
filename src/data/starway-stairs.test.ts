import { describe, expect, it } from "vitest";
import {
  rankBustsStarwayStairsTier,
  starwayStairsBustRangeLabel,
  starwayStairsDrawTargetLabel,
  starwayStairsEssenceReward,
  starwayStairsWagerAmount,
} from "./starway-stairs";
import { MINIMAL_SITES_DATA } from "../__test-helpers__/atlas-fixtures";

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
      MINIMAL_SITES_DATA.gamble.starwayStairs.tiers.map((tier) => ({
        tierNumber: tier.tier,
        bustRange: starwayStairsBustRangeLabel(tier),
        drawTarget: starwayStairsDrawTargetLabel(tier),
        reward: starwayStairsEssenceReward(economy, tier.tier),
      })),
    ).toEqual([
      { tierNumber: 1, bustRange: "2", drawTarget: "3-A", reward: 67 },
      { tierNumber: 2, bustRange: "2-4", drawTarget: "5-A", reward: 149 },
      { tierNumber: 3, bustRange: "2-7", drawTarget: "8-A", reward: 313 },
    ]);
  });

  it("uses inclusive low-rank bust ranges for every tier", () => {
    const rules = MINIMAL_SITES_DATA.gamble.starwayStairs;
    expect(rankBustsStarwayStairsTier(rules, "2", 1)).toBe(true);
    expect(rankBustsStarwayStairsTier(rules, "3", 1)).toBe(false);
    expect(rankBustsStarwayStairsTier(rules, "4", 2)).toBe(true);
    expect(rankBustsStarwayStairsTier(rules, "5", 2)).toBe(false);
    expect(rankBustsStarwayStairsTier(rules, "7", 3)).toBe(true);
    expect(rankBustsStarwayStairsTier(rules, "8", 3)).toBe(false);
  });
});
