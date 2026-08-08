import type { SiteType, TransfigurationType } from "./journey";

export interface RewardSelectionBand {
  fraction: number;
  minimum: number;
}

export interface RewardSelectionTuning {
  bandFraction: number;
  bandMinimum: number;
  strongBandFraction: number;
  strongBandMinimum: number;
  dreamsignBandFraction: number;
  dreamsignBandMinimum: number;
  minDeckForFit: number;
  minDeckForPurge: number;
  purgeMisfitFraction: number;
  starterPurgeBonus: number;
  subtypeMinPoolCards: number;
  bundleGrowthBandSize: number;
  strongBlend: Readonly<{ fit: number; quality: number }>;
  copiesBlend: Readonly<{ fit: number; quality: number }>;
  duplicateBlend: Readonly<{ quality: number; fitLoo: number }>;
  transfigureBlend: Readonly<{ benefit: number; centrality: number }>;
  bundleBlend: Readonly<{ seed: number; bundle: number; fit: number }>;
  categoryAffineWeight: number;
  categoryDeckAffineMinimum: number;
  categoryClusterAffineMinimum: number;
  centrality: Readonly<{
    priorWeight: number;
    cooccurrenceWeight: number;
    fallback: number;
    sparkThreshold: number;
    sparkBonus: number;
  }>;
  dreamsign: Readonly<{
    fullCoverageCount: number;
    featurelessCoverage: number;
    qualityWeight: Readonly<Record<"1" | "2" | "3", number>>;
  }>;
  costBands: Readonly<{
    cheapMaximum: number;
    midMinimum: number;
    midMaximum: number;
    bigMinimum: number;
    cheapCharacterMaximum: number;
  }>;
  allowedTransfigurations: readonly TransfigurationType[];
  transfigurationBenefit: Readonly<{
    empoweredCostDivisor: number;
    kindledSparkDivisor: number;
    flat: Readonly<Partial<Record<TransfigurationType, number>>>;
  }>;
  placeableSiteTypes: readonly SiteType[];
}

/** Validated browser data compiled from data/reward_selection.toml. */
export interface RewardSelectionData {
  schemaVersion: 1;
  rulesVersion: "1";
  contentHash: string;
  foldHash: string;
  tuning: RewardSelectionTuning;
}
