import { describe, expect, it } from "vitest";
import {
  rankBustsStarwayStairsTier,
  starwayStairsBustRangeLabel,
  starwayStairsDrawTargetLabel,
  starwayStairsEssenceReward,
  starwayStairsWagerAmount,
} from "./starway-stairs";
import { gambleGameByRulesKind } from "./gamble-data";
import { gambleFixture } from "../testing/gamble-fixture";

describe("Starway Stairs rules", () => {
  const economy = {
    kind: "starwayStairs" as const,
    standardWager: 31,
    enhancedWager: 19,
    rewards: [
      { tier: 1 as const, essence: 67 },
      { tier: 2 as const, essence: 149 },
      { tier: 3 as const, essence: 313 },
    ],
  };
  it("defines the three escalating bust ranges and rewards", () => {
    expect(starwayStairsWagerAmount(economy, false)).toBe(31);
    expect(starwayStairsWagerAmount(economy, true)).toBe(19);
    expect(
      gambleGameByRulesKind(gambleFixture(), "starwayStairs").rules.tiers.map(
        (tier) => ({
          tierNumber: tier.tier,
          bustRange: starwayStairsBustRangeLabel(tier),
          drawTarget: starwayStairsDrawTargetLabel(tier),
          reward: starwayStairsEssenceReward(economy, tier.tier),
        }),
      ),
    ).toEqual([
      { tierNumber: 1, bustRange: "2", drawTarget: "3-A", reward: 67 },
      { tierNumber: 2, bustRange: "2-4", drawTarget: "5-A", reward: 149 },
      { tierNumber: 3, bustRange: "2-7", drawTarget: "8-A", reward: 313 },
    ]);
  });

  it("uses inclusive low-rank bust ranges for every tier", () => {
    const rules = gambleGameByRulesKind(gambleFixture(), "starwayStairs").rules;
    expect(rankBustsStarwayStairsTier(rules, "2", 1)).toBe(true);
    expect(rankBustsStarwayStairsTier(rules, "3", 1)).toBe(false);
    expect(rankBustsStarwayStairsTier(rules, "4", 2)).toBe(true);
    expect(rankBustsStarwayStairsTier(rules, "5", 2)).toBe(false);
    expect(rankBustsStarwayStairsTier(rules, "7", 3)).toBe(true);
    expect(rankBustsStarwayStairsTier(rules, "8", 3)).toBe(false);
  });
});
