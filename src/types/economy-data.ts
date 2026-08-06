export interface EconomyRange { min: number; max: number }
export interface EconomyWeightedValue { value: number; weight: number }
export interface EconomyStock { cardSlots: number; dreamsignSlots: number }
export interface TransfigurationCostBand { base: number; jitter: number; floor: number }
export interface TransfigurationStatBand extends TransfigurationCostBand {
  minimumDelta: number;
  maximumDelta: number | null;
}

export interface EconomyData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  journey: { defaultStartingEssence: number; dreamsignCap: number };
  shop: {
    prices: { standardCard: number; specialtyCard: number; dreamsign: number };
    stock: {
      cardShop: EconomyStock;
      specialtyShop: EconomyStock;
      dreamsignMarket: EconomyStock;
    };
    discounts: {
      slotCounts: EconomyWeightedValue[];
      percentages: EconomyWeightedValue[];
    };
    reroll: { standardPrice: number; enhancedPrice: number; maxPerVisit: number };
  };
  siteRewards: {
    essence: { standard: EconomyRange; enhanced: EconomyRange };
    reward: { fallbackEssence: EconomyRange };
    dreamsignRevelation: { standardOfferCount: number; enhancedOfferCount: number };
  };
  purge: { marginalCosts: number[]; enhancedDiscountPercent: number };
  transfiguration: {
    minimumCost: number;
    maximumCost: number;
    step: number;
    freeBand: TransfigurationCostBand;
    formBands: Record<"Amplified" | "Attuned" | "Inspired" | "Enduring" | "Resonant" | "Perfected", TransfigurationCostBand>;
    statDeltaBands: TransfigurationStatBand[];
  };
  battleReward: { baseEssence: number; essencePerCompletionLevel: number; minimumEssence: number };
  gamble: {
    threeGate: {
      standardWager: number;
      enhancedWager: number;
      rewards: Record<"six" | "nine" | "jack", number>;
    };
    ladderClimb: {
      winEssence: number;
      attempts: Array<{ attempt: 1 | 2 | 3 | 4; standardCost: number; enhancedCost: number }>;
    };
    starwayStairs: {
      standardWager: number;
      enhancedWager: number;
      tiers: Array<{ tier: 1 | 2 | 3; essenceReward: number }>;
    };
  };
  exploration: { defaultEssencePerSpark: number };
}
