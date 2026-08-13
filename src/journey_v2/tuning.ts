import auguryJson from "../generated/config/augury-data.json";
import sitesJson from "../../public/sites-data.json";
import tidesJson from "../../public/tides4-data.json";
import { parseAuguryData } from "../data/augury-data";
import { buildRewardSelectionData } from "../data/reward-selection-data";
import { validateTides4Decks } from "../draft/pool/tides4-io";
import type { SitesData } from "../types/sites-data";

/**
 * Generated compatibility view of the RON-authored reward-selection tuning.
 * Runtime selection uses the JourneyContent instance so Vite hot reloads apply;
 * this export keeps isolated algorithm tests and analysis scripts concise.
 */
export const MERCHANT_TUNING = {
  ...buildRewardSelectionData({
    tides: validateTides4Decks(tidesJson),
    augury: parseAuguryData(auguryJson),
    sites: sitesJson as SitesData,
  }).tuning,
  categoryDraftSize: parseAuguryData(auguryJson).archetypes.find(
    (entry) => entry.id === "category_draft_known",
  )?.quantities.chooserSize ?? 4,
  duplicateChooserSize: parseAuguryData(auguryJson).archetypes.find(
    (entry) => entry.id === "duplicate",
  )?.quantities.chooserSize ?? 3,
  weights: Object.fromEntries(
    parseAuguryData(auguryJson).archetypes.map((entry) => [entry.id, entry.weight]),
  ),
} as const;
