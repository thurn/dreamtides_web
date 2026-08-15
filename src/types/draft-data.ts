import type { Rarity } from "./cards";
import type { PoolVariant } from "../draft/pool/types";

export interface DraftRarityCap {
  rarity: Rarity;
  poolCopyCap: number;
  maxPicksPerRun: number;
}

export interface Tides4Tuning {
  dealSize: number;
  copyCap: number;
  maxFacets: number;
}

/** Validated browser data compiled from data/draft_site.toml. */
export interface DraftData {
  schemaVersion: 1;
  contentHash: ContentHash;
  foldHash: FoldHash;
  offers: {
    cardsPerOffer: number;
    picksPerSite: number;
  };
  rarityCaps: DraftRarityCap[];
  pool: {
    defaultStrategy: Extract<PoolVariant, "tides4">;
    tides4: Tides4Tuning;
  };
}
import type { ContentHash, FoldHash } from "./content-hash";
