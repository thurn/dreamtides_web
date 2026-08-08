import auguryJson from "../generated/config/augury-data.json";
import rewardSelectionJson from "../generated/config/reward-selection-data.json";
import { parseAuguryData } from "../data/augury-data";
import { parseRewardSelectionData } from "../data/reward-selection-data";

/**
 * Generated compatibility view of the TOML-authored reward-selection tuning.
 * Runtime selection uses the JourneyContent instance so Vite hot reloads apply;
 * this export keeps isolated algorithm tests and analysis scripts concise.
 */
export const MERCHANT_TUNING = {
  ...parseRewardSelectionData(rewardSelectionJson).tuning,
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
