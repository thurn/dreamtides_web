import type { AuguryData } from "../types/augury-data";
import type { SitesData } from "../types/sites-data";
import type { Tides4DecksJson } from "../draft/pool/tides4-io";
import { stableDigest } from "../reward-selection/stable";
import type { RewardSelectionData } from "../types/reward-selection-data";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

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
    minDeckForPurge: input.sites.encounterSites.minDeckForPurge,
    subtypeMinPoolCards: input.augury.selection.subtypeMinPoolCards,
    costBands: input.augury.selection.costBands,
    placeableSites: input.sites.encounterSites.placeableSites,
  } as const;
  const payload = { schemaVersion: 2 as const, rulesVersion: "2" as const, tuning };
  const digest = stableDigest(payload);
  return {
    ...payload,
    contentHash: parseContentHash(digest),
    foldHash: parseFoldHash(digest),
  };
}
