import { describe, expect, it } from "vitest";
import {
  MERCHANT_MARKET_JITTER_MAX,
  MERCHANT_MARKET_JITTER_MIN,
  MERCHANT_PRICE_MINIMUM,
  marketJitterFor,
  needSeverityMultiplierFor,
  priceMerchantReward,
  valueEssenceForCardGrant,
} from "./pricing";
import type { PriceMerchantRewardInput } from "./pricing";

function baseInput(
  overrides: Partial<PriceMerchantRewardInput> = {},
): PriceMerchantRewardInput {
  return {
    questSeed: "quest-seed-alpha",
    siteId: "site-dream-merchant",
    offerId: "offer-a",
    rewardBuilderId: "grant_support_card",
    valueEssence: 90,
    currentEssence: 200,
    essenceCap: 360,
    needSeverity: 0.5,
    rewardFamily: "cardGrant",
    chooserCount: 1,
    rarity: null,
    broadCatalogReach: 0,
    outsidePool: false,
    ...overrides,
  };
}

describe("priceMerchantReward", () => {
  it("returns identical results for identical inputs", () => {
    const input = baseInput({
      offerId: "stable-offer",
      questSeed: "stable-seed",
      chooserCount: 4,
      broadCatalogReach: 0.6,
    });

    expect(priceMerchantReward(input)).toEqual(priceMerchantReward(input));
  });

  it("changes jitter when offer id or seed changes while staying inside bounds", () => {
    const original = baseInput({
      questSeed: "jitter-seed-a",
      offerId: "jitter-offer-a",
    });
    const changedOffer = baseInput({
      questSeed: "jitter-seed-a",
      offerId: "jitter-offer-b",
    });
    const changedSeed = baseInput({
      questSeed: "jitter-seed-b",
      offerId: "jitter-offer-a",
    });

    const jitters = [
      marketJitterFor(original),
      marketJitterFor(changedOffer),
      marketJitterFor(changedSeed),
    ];

    expect(new Set(jitters).size).toBeGreaterThan(1);
    for (const jitter of jitters) {
      expect(jitter).toBeGreaterThanOrEqual(MERCHANT_MARKET_JITTER_MIN);
      expect(jitter).toBeLessThanOrEqual(MERCHANT_MARKET_JITTER_MAX);
    }
  });

  it("uses a minimum price of 25 essence", () => {
    const result = priceMerchantReward(
      baseInput({
        valueEssence: 1,
        currentEssence: 200,
        essenceCap: 360,
      }),
    );

    expect(result.price).toBe(MERCHANT_PRICE_MINIMUM);
  });

  it("keeps positive-value rewards at the floor and locked when essence cap is zero", () => {
    const result = priceMerchantReward(
      baseInput({
        valueEssence: 90,
        currentEssence: 0,
        essenceCap: 0,
      }),
    );

    expect(result.price).toBe(MERCHANT_PRICE_MINIMUM);
    expect(result.locked).toBe(true);
    expect(result.lockedReason).toBe("insufficient_essence");
  });

  it("keeps positive-value rewards at the floor and locked when essence cap is below the floor", () => {
    const result = priceMerchantReward(
      baseInput({
        valueEssence: 90,
        currentEssence: 10,
        essenceCap: 10,
      }),
    );

    expect(result.price).toBe(MERCHANT_PRICE_MINIMUM);
    expect(result.locked).toBe(true);
    expect(result.lockedReason).toBe("insufficient_essence");
  });

  it("caps price at the essence cap", () => {
    const result = priceMerchantReward(
      baseInput({
        valueEssence: 1_000,
        currentEssence: 360,
        essenceCap: 140,
        rewardFamily: "dreamsign",
        rarity: "Legendary",
        chooserCount: 6,
        broadCatalogReach: 1,
        outsidePool: true,
      }),
    );

    expect(result.price).toBe(140);
  });

  it("reports locked state when unaffordable and unlocked state when affordable", () => {
    const unaffordable = priceMerchantReward(
      baseInput({
        valueEssence: 100,
        currentEssence: 40,
        essenceCap: 360,
      }),
    );
    const affordable = priceMerchantReward(
      baseInput({
        valueEssence: 100,
        currentEssence: 360,
        essenceCap: 360,
      }),
    );

    expect(unaffordable.locked).toBe(true);
    expect(unaffordable.lockedReason).toBe("insufficient_essence");
    expect(affordable.locked).toBe(false);
    expect(affordable.lockedReason).toBeUndefined();
  });

  it("does not charge severe needs more than light needs for the same base inputs", () => {
    const light = priceMerchantReward(
      baseInput({
        needSeverity: 0,
      }),
    );
    const severe = priceMerchantReward(
      baseInput({
        needSeverity: 1,
      }),
    );

    expect(needSeverityMultiplierFor(1)).toBeLessThanOrEqual(
      needSeverityMultiplierFor(0),
    );
    expect(severe.needSeverityMultiplier).toBeLessThanOrEqual(
      light.needSeverityMultiplier,
    );
    expect(severe.price).toBeLessThanOrEqual(light.price);
  });

  it("maps v2 card grant rarity to sensible essence values", () => {
    const ordinary = valueEssenceForCardGrant();
    const nullRarity = valueEssenceForCardGrant(null);
    const legendary = valueEssenceForCardGrant("Legendary");

    expect(ordinary).toBeGreaterThan(0);
    expect(nullRarity).toBe(ordinary);
    expect(valueEssenceForCardGrant("Starter")).toBe(ordinary);
    expect(valueEssenceForCardGrant("Special")).toBe(ordinary);
    expect(legendary).toBeGreaterThan(ordinary);
  });
});
