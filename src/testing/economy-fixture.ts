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
        slotCounts: [{ value: 1, weight: 1 }, { value: 2, weight: 1 }],
        percentages: [30, 40, 50, 60, 70, 80, 90].map((value) => ({ value, weight: 1 })),
      },
      reroll: { standardPrice: 50, enhancedPrice: 0, maxPerVisit: 1 },
    },
    siteRewards: {
      essence: { standard: { min: 200, max: 300 }, enhanced: { min: 400, max: 600 } },
      reward: { fallbackEssence: { min: 150, max: 350 } },
      dreamsignRevelation: { standardOfferCount: 3, enhancedOfferCount: 4 },
    },
    purge: { marginalCosts: [40, 60, 90, 130, 180, 240], enhancedDiscountPercent: 30 },
    transfiguration: {
      minimumCost: 0,
      maximumCost: 100,
      step: 10,
      freeBand: { base: 0, jitter: 0, floor: 0 },
      formBands: {
        Amplified: { base: 10, jitter: 20, floor: 10 },
        Attuned: { base: 10, jitter: 20, floor: 10 },
        Inspired: { base: 20, jitter: 20, floor: 10 },
        Enduring: { base: 50, jitter: 30, floor: 20 },
        Resonant: { base: 50, jitter: 30, floor: 20 },
        Perfected: { base: 100, jitter: 0, floor: 100 },
      },
      statDeltaBands: [
        { minimumDelta: 1, maximumDelta: 1, base: 10, jitter: 20, floor: 10 },
        { minimumDelta: 2, maximumDelta: 2, base: 30, jitter: 20, floor: 10 },
        { minimumDelta: 3, maximumDelta: 3, base: 50, jitter: 20, floor: 30 },
        { minimumDelta: 4, maximumDelta: null, base: 70, jitter: 20, floor: 50 },
      ],
    },
    battleReward: { baseEssence: 100, essencePerCompletionLevel: 50, minimumEssence: 0 },
    gamble: {
      threeGate: { standardWager: 50, enhancedWager: 45, rewards: { six: 100, nine: 150, jack: 200 } },
      ladderClimb: {
        winEssence: 25,
        attempts: [0, 5, 10, 15].map((standardCost, index) => ({
          attempt: (index + 1) as 1 | 2 | 3 | 4,
          standardCost,
          enhancedCost: 0,
        })),
      },
      starwayStairs: {
        standardWager: 30,
        enhancedWager: 20,
        tiers: [60, 140, 300].map((essenceReward, index) => ({
          tier: (index + 1) as 1 | 2 | 3,
          essenceReward,
        })),
      },
    },
    exploration: { defaultEssencePerSpark: 40 },
  };
}
