import { describe, expect, it } from "vitest";
import {
  maxAffordablePurgeCount,
  purgeCardPrice,
  purgeDiscountPercent,
  purgeMarginalCost,
  purgeVisitCost,
} from "./purge-pricing";

const CONFIG = {
  marginalCosts: [11, 23, 47, 89],
  enhancedDiscountPercent: 25,
};

describe("purge pricing", () => {
  it("reads the authored marginal table and derives its cap", () => {
    expect(CONFIG.marginalCosts.map((_cost, index) => purgeMarginalCost(CONFIG, index + 1)))
      .toEqual(CONFIG.marginalCosts);
    expect(purgeMarginalCost(CONFIG, 5)).toBe(Infinity);
  });

  it("sums marginal costs and applies combined discounts", () => {
    expect(purgeVisitCost(CONFIG, 3)).toBe(81);
    expect(purgeDiscountPercent(CONFIG, { isEnhanced: true, essenceDiscountPercent: 15 })).toBe(40);
    expect(purgeCardPrice(CONFIG, 2, { isEnhanced: true })).toBe(17);
  });

  it("finds the largest affordable count without exceeding the requested cap", () => {
    expect(maxAffordablePurgeCount(CONFIG, 80, 4)).toBe(2);
    expect(maxAffordablePurgeCount(CONFIG, 10_000, 3)).toBe(3);
    expect(maxAffordablePurgeCount(CONFIG, 80, 4, { isEnhanced: true })).toBe(3);
  });
});
