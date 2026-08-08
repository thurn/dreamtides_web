import { describe, expect, it } from "vitest";
import { compileEconomyData } from "./economy-data.mjs";

function fixture() {
  const bands = [
    ["Amplified", 20, 10, 10],
    ["Attuned", 30, 10, 10],
    ["Inspired", 40, 20, 20],
    ["Enduring", 60, 20, 30],
    ["Resonant", 70, 20, 30],
    ["Perfected", 120, 0, 120],
  ].map(([form, base, jitter, floor]) => ({ form, base, jitter, floor }));
  return {
    "schema-version": 1,
    journey: { "default-starting-essence": 137, "dreamsign-cap": 9 },
    shop: {
      prices: { "standard-card": 73, "specialty-card": 149, dreamsign: 31 },
      stock: {
        "card-shop": { "card-slots": 4, "dreamsign-slots": 1 },
        "specialty-shop": { "card-slots": 3, "dreamsign-slots": 0 },
        "dreamsign-market": { "card-slots": 1, "dreamsign-slots": 2 },
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
    "site-rewards": {
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
    purge: { "marginal-costs": [13, 29, 61], "enhanced-discount-percent": 25 },
    transfiguration: {
      "minimum-cost": 0,
      "maximum-cost": 120,
      step: 10,
      "free-band": { base: 0, jitter: 0, floor: 0 },
      "form-bands": bands,
      "stat-delta-bands": [
        {
          "minimum-delta": 1,
          "maximum-delta": 1,
          base: 20,
          jitter: 10,
          floor: 10,
        },
        {
          "minimum-delta": 2,
          "maximum-delta": 2,
          base: 40,
          jitter: 20,
          floor: 20,
        },
        {
          "minimum-delta": 3,
          "maximum-delta": 3,
          base: 60,
          jitter: 20,
          floor: 40,
        },
        { "minimum-delta": 4, base: 80, jitter: 20, floor: 60 },
      ],
    },
    "battle-reward": {
      "base-essence": 43,
      "essence-per-completion-level": 17,
      "minimum-essence": 3,
    },
    exploration: { "default-essence-per-spark": 43 },
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
        source.extra = {};
      },
      /unknown key/u,
    ],
    [
      "obsolete Gamble section",
      (source) => {
        source.gamble = {};
      },
      /root.gamble: unknown key/u,
    ],
    [
      "missing section",
      (source) => {
        delete source.purge;
      },
      /missing key purge/u,
    ],
    [
      "invalid range",
      (source) => {
        source["site-rewards"].essence.standard = { min: 9, max: 4 };
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
        source.purge["enhanced-discount-percent"] = 101;
      },
      /expected a value/u,
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
    [
      "nonzero free band",
      (source) => {
        source.transfiguration["free-band"].base = 10;
      },
      /must remain zero-cost/u,
    ],
    [
      "malformed bands",
      (source) => {
        source.transfiguration["stat-delta-bands"][3]["minimum-delta"] = 5;
      },
      /delta identities/u,
    ],
  ])("rejects %s", (_label, mutate, pattern) => {
    const source = fixture();
    mutate(source);
    expect(() => compileEconomyData(source)).toThrow(pattern);
  });
});
