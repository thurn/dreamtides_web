import { describe, expect, it } from "vitest";
import {
  rankBustsStarwayStairsTier,
  STARWAY_STAIRS_TIERS,
  starwayStairsBustChanceLabel,
} from "./starway-stairs";

describe("Starway Stairs rules", () => {
  it("defines the three escalating bust chances and rewards", () => {
    expect(
      STARWAY_STAIRS_TIERS.map((tier) => ({
        tierNumber: tier.tierNumber,
        bustChance: starwayStairsBustChanceLabel(tier),
        reward: tier.essenceReward,
      })),
    ).toEqual([
      { tierNumber: 1, bustChance: "7.69%", reward: 60 },
      { tierNumber: 2, bustChance: "23.08%", reward: 140 },
      { tierNumber: 3, bustChance: "46.15%", reward: 300 },
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
