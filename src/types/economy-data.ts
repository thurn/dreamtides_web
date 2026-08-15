export interface EconomyRange {
  min: number;
  max: number;
}
export interface EconomyWeightedValue {
  value: number;
  weight: number;
}
export interface EconomyStock {
  cardSlots: number;
  dreamsignSlots: number;
}
export interface EconomyData {
  schemaVersion: 1;
  contentHash: ContentHash;
  foldHash: FoldHash;
  journey: { defaultStartingEssence: number; dreamsignCap: number };
  shop: {
    prices: { standardCard: number; specialtyCard: number; dreamsign: number };
    stock: {
      cardShop: EconomyStock;
      specialtyShop: EconomyStock;
      dreamsignBazaar: EconomyStock;
    };
    discounts: {
      slotCounts: EconomyWeightedValue[];
      percentages: EconomyWeightedValue[];
    };
    reroll: {
      standardPrice: number;
      enhancedPrice: number;
      maxPerVisit: number;
    };
  };
  siteRewards: {
    essence: { standard: EconomyRange; enhanced: EconomyRange };
    reward: { fallbackEssence: EconomyRange };
    dreamsignRevelation: {
      standardOfferCount: number;
      enhancedOfferCount: number;
    };
  };
  purge: { marginalCosts: number[]; enhancedDiscountPercent: number };
  battleReward: {
    baseEssence: number;
    essencePerCompletionLevel: number;
    minimumEssence: number;
  };
}
import type { ContentHash, FoldHash } from "./content-hash";
