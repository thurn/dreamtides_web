import type { SiteType } from "./journey";

export interface RewardSelectionBand {
  fraction: number;
  minimum: number;
}

export interface RewardSelectionTuning {
  bandFraction: number;
  bandMinimum: number;
  minDeckForPurge: number;
  subtypeMinPoolCards: number;
  costBands: Readonly<{
    cheapMaximum: number;
    midMinimum: number;
    midMaximum: number;
    bigMinimum: number;
    cheapCharacterMaximum: number;
  }>;
  placeableSites: readonly SiteType[];
}

/** Runtime selector tuning assembled from its owning RON catalogs. */
export interface RewardSelectionData {
  schemaVersion: 2;
  rulesVersion: "2";
  contentHash: ContentHash;
  foldHash: FoldHash;
  tuning: RewardSelectionTuning;
}
import type { ContentHash, FoldHash } from "./content-hash";
