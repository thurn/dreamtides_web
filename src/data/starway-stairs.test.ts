import { describe, expect, it } from "vitest";
import {
  rankBustsStarwayStairsTier,
  STARWAY_STAIRS_TIERS,
  starwayStairsBustRangeLabel,
  starwayStairsDrawTargetLabel,
} from "./starway-stairs";

describe("Starway Stairs rules", () => {
  it("defines the three escalating bust ranges and rewards", () => {
    expect(
      STARWAY_STAIRS_TIERS.map((tier) => ({
        tierNumber: tier.tierNumber,
        bustRange: starwayStairsBustRangeLabel(tier),
        drawTarget: starwayStairsDrawTargetLabel(tier),
        reward: tier.essenceReward,
      })),
    ).toEqual([
      { tierNumber: 1, bustRange: "2", drawTarget: "3+", reward: 60 },
      { tierNumber: 2, bustRange: "2-4", drawTarget: "5+", reward: 140 },
      { tierNumber: 3, bustRange: "2-7", drawTarget: "8+", reward: 300 },
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
