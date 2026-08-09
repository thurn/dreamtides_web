import type { EconomyData } from "../types/economy-data";

/** Stable synthetic economy input for unit tests which are not testing compilation. */
export function economyFixture(): EconomyData {
  return {
    schemaVersion: 1,
    contentHash: "a".repeat(64),
    foldHash: "a".repeat(64),
    journey: { defaultStartingEssence: 200, dreamsignCap: 12 },
    shop: {
      prices: { standardCard: 100, specialtyCard: 200, dreamsign: 50 },
      stock: {
        cardShop: { cardSlots: 5, dreamsignSlots: 0 },
        specialtyShop: { cardSlots: 5, dreamsignSlots: 0 },
        dreamsignMarket: { cardSlots: 0, dreamsignSlots: 3 },
      },
      discounts: {
        slotCounts: [
          { value: 1, weight: 1 },
          { value: 2, weight: 1 },
        ],
        percentages: [30, 40, 50, 60, 70, 80, 90].map((value) => ({
          value,
          weight: 1,
        })),
      },
      reroll: { standardPrice: 50, enhancedPrice: 0, maxPerVisit: 1 },
    },
    siteRewards: {
      essence: {
        standard: { min: 200, max: 300 },
        enhanced: { min: 400, max: 600 },
      },
      reward: { fallbackEssence: { min: 150, max: 350 } },
      dreamsignRevelation: { standardOfferCount: 3, enhancedOfferCount: 4 },
    },
    purge: {
      marginalCosts: [40, 60, 90, 130, 180, 240],
      enhancedDiscountPercent: 30,
    },
    battleReward: {
      baseEssence: 100,
      essencePerCompletionLevel: 50,
      minimumEssence: 0,
    },
    exploration: { defaultEssencePerSpark: 40 },
  };
}
