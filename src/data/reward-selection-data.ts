import type { AuguryData } from "../types/augury-data";
import type { SitesData } from "../types/sites-data";
import type { Tides4DecksJson } from "../draft/pool/tides4-io";
import { stableDigest } from "../reward-selection/stable";
import type { RewardSelectionData } from "../types/reward-selection-data";

export type { RewardSelectionData, RewardSelectionTuning } from "../types/reward-selection-data";

/** Assemble the selector's compatibility view from its three owning RON catalogs. */
export function buildRewardSelectionData(input: {
  tides: Tides4DecksJson;
  augury: AuguryData;
  sites: SitesData;
}): RewardSelectionData {
  const tuning = {
    bandFraction: input.tides.selection.bandFraction,
    bandMinimum: input.tides.selection.bandMinimum,
    minDeckForPurge: input.sites.selection.minDeckForPurge,
    subtypeMinPoolCards: input.augury.selection.subtypeMinPoolCards,
    costBands: input.augury.selection.costBands,
    placeableSiteTypes: input.sites.selection.placeableTypes,
  } as const;
  const payload = { schemaVersion: 2 as const, rulesVersion: "2" as const, tuning };
  const contentHash = stableDigest(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
