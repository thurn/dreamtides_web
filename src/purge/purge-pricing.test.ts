import { describe, expect, it } from "vitest";
import {
  MAX_PURGE_PER_VISIT,
  maxAffordablePurgeCount,
  purgeCardPrice,
  purgeDiscountPercent,
  purgeMarginalCost,
  purgeVisitCost,
} from "./purge-pricing";

describe("purgeMarginalCost", () => {
  it("follows the 30 + 5*N*(N+1) curve", () => {
    expect(purgeMarginalCost(1)).toBe(40);
    expect(purgeMarginalCost(2)).toBe(60);
    expect(purgeMarginalCost(3)).toBe(90);
    expect(purgeMarginalCost(4)).toBe(130);
    expect(purgeMarginalCost(5)).toBe(180);
    expect(purgeMarginalCost(6)).toBe(240);
  });

  it("matches the doc's marginal-cost anchors for the first five cards", () => {
    expect([1, 2, 3, 4, 5].map((n) => purgeMarginalCost(n))).toEqual([
      40, 60, 90, 130, 180,
    ]);
  });

  it("is zero or below for non-positive indices", () => {
    expect(purgeMarginalCost(0)).toBe(0);
    expect(purgeMarginalCost(-3)).toBe(0);
  });

  it("strictly increases with each additional card", () => {
    for (let n = 1; n < 12; n += 1) {
      expect(purgeMarginalCost(n + 1)).toBeGreaterThan(purgeMarginalCost(n));
    }
  });
});

describe("purgeVisitCost", () => {
  it("is the running sum of per-card prices", () => {
    expect(purgeVisitCost(0)).toBe(0);
    expect(purgeVisitCost(1)).toBe(40);
    expect(purgeVisitCost(2)).toBe(100);
    expect(purgeVisitCost(3)).toBe(190);
    expect(purgeVisitCost(4)).toBe(320);
    expect(purgeVisitCost(5)).toBe(500);
    expect(purgeVisitCost(6)).toBe(740);
  });

  it("matches the doc's economy anchors", () => {
    // One standard shop card costs 100 essence; purging two cards in a visit
    // costs the same. Purging five cards in one visit costs 500 essence.
    expect(purgeVisitCost(2)).toBe(100);
    expect(purgeVisitCost(5)).toBe(500);
  });

  it("equals the sum of marginal costs across the visit", () => {
    let running = 0;
    for (let n = 1; n <= MAX_PURGE_PER_VISIT; n += 1) {
      running += purgeCardPrice(n);
      expect(purgeVisitCost(n)).toBe(running);
    }
  });
});

describe("discounts", () => {
  it("combines the enhanced and essence discounts, clamped to 100", () => {
    expect(purgeDiscountPercent()).toBe(0);
    expect(purgeDiscountPercent({ isEnhanced: true })).toBe(30);
    expect(purgeDiscountPercent({ essenceDiscountPercent: 20 })).toBe(20);
    expect(
      purgeDiscountPercent({ isEnhanced: true, essenceDiscountPercent: 20 }),
    ).toBe(50);
    expect(
      purgeDiscountPercent({ isEnhanced: true, essenceDiscountPercent: 200 }),
    ).toBe(100);
  });

  it("ignores negative essence discounts", () => {
    expect(purgeDiscountPercent({ essenceDiscountPercent: -50 })).toBe(0);
  });

  it("makes an enhanced visit strictly cheaper than a normal one", () => {
    for (let n = 1; n <= MAX_PURGE_PER_VISIT; n += 1) {
      expect(purgeVisitCost(n, { isEnhanced: true })).toBeLessThan(
        purgeVisitCost(n),
      );
    }
  });
});

describe("maxAffordablePurgeCount", () => {
  it("returns how many cards fit in the budget", () => {
    // Cumulative: 40, 100, 190, 320, 500.
    expect(maxAffordablePurgeCount(0, 6)).toBe(0);
    expect(maxAffordablePurgeCount(39, 6)).toBe(0);
    expect(maxAffordablePurgeCount(40, 6)).toBe(1);
    expect(maxAffordablePurgeCount(100, 6)).toBe(2);
    expect(maxAffordablePurgeCount(189, 6)).toBe(2);
    expect(maxAffordablePurgeCount(190, 6)).toBe(3);
    expect(maxAffordablePurgeCount(500, 6)).toBe(5);
  });

  it("never exceeds the requested cap", () => {
    expect(maxAffordablePurgeCount(100000, 3)).toBe(3);
  });

  it("lets a discount stretch the budget to more cards", () => {
    const budget = 190;
    expect(
      maxAffordablePurgeCount(budget, 6, { isEnhanced: true }),
    ).toBeGreaterThanOrEqual(maxAffordablePurgeCount(budget, 6));
  });
});
