import { describe, expect, it } from "vitest";
import { compileEconomyData } from "./economy-data.mjs";

function fixture() {
  return {
    journey: {
      "schema-version": 1,
      "default-starting-essence": 137,
      "dreamsign-cap": 9,
    },
    shop: {
      "schema-version": 1,
      prices: { "standard-card": 73, "specialty-card": 149, dreamsign: 31 },
      stock: {
        "card-shop": { "card-slots": 4, "dreamsign-slots": 1 },
        "specialty-shop": { "card-slots": 3, "dreamsign-slots": 0 },
        "dreamsign-bazaar": { "card-slots": 1, "dreamsign-slots": 2 },
      },
      discounts: {
        "slot-counts": [
          { value: 1, weight: 3 },
          { value: 3, weight: 1 },
        ],
        percentages: [
          { value: 25, weight: 2 },
          { value: 75, weight: 1 },
        ],
      },
      reroll: { "standard-price": 27, "enhanced-price": 2, "max-per-visit": 2 },
    },
    sites: {
      "schema-version": 1,
      rewards: {
        essence: {
          standard: { min: 41, max: 59 },
          enhanced: { min: 83, max: 101 },
        },
        reward: { "fallback-essence": { min: 19, max: 37 } },
        "dreamsign-revelation": {
          "standard-offer-count": 2,
          "enhanced-offer-count": 5,
        },
      },
      purge: {
        "marginal-costs": [13, 29, 61],
        "enhanced-discount-percent": 25,
      },
    },
    battle: {
      "schema-version": 1,
      battle: {
        reward: {
          "base-essence": 43,
          "essence-per-completion-level": 17,
          "minimum-essence": 3,
        },
      },
    },
  };
}

describe("compileEconomyData", () => {
  it("normalizes deterministically and hashes every v1 field", () => {
    const source = fixture();
    const first = compileEconomyData(source);
    const second = compileEconomyData(
      Object.fromEntries(Object.entries(source).reverse()),
    );
    expect(second).toEqual(first);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.foldHash).toBe(first.contentHash);
    source.shop.prices["standard-card"] += 1;
    expect(compileEconomyData(source).foldHash).not.toBe(first.foldHash);
  });

  it.each([
    [
      "unknown section",
      (source) => {
        source.journey.extra = {};
      },
      /unknown key/u,
    ],
    [
      "obsolete Gamble section",
      (source) => {
        source.shop.gamble = {};
      },
      /shop-site.gamble: unknown key/u,
    ],
    [
      "missing section",
      (source) => {
        delete source.sites.purge;
      },
      /sites\.purge: expected a table/u,
    ],
    [
      "invalid range",
      (source) => {
        source.sites.rewards.essence.standard = { min: 9, max: 4 };
      },
      /min must not exceed max/u,
    ],
    [
      "negative count",
      (source) => {
        source.shop.stock["card-shop"]["card-slots"] = -1;
      },
      /expected a value/u,
    ],
    [
      "bad percentage",
      (source) => {
        source.sites.purge["enhanced-discount-percent"] = 101;
      },
      /between 0 and 100/u,
    ],
    [
      "empty weights",
      (source) => {
        source.shop.discounts.percentages = [];
      },
      /must not be empty/u,
    ],
    [
      "duplicate weights",
      (source) => {
        source.shop.discounts.percentages.push({ value: 25, weight: 1 });
      },
      /duplicate value/u,
    ],
  ])("rejects %s", (_label, mutate, pattern) => {
    const source = fixture();
    mutate(source);
    expect(() => compileEconomyData(source)).toThrow(pattern);
  });
});
