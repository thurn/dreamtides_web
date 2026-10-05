import { loadAuguryData } from "../data/augury-data";
import { loadTides4Decks } from "../data/cards-v2-database";
import { buildRewardSelectionData } from "../data/reward-selection-data";
import { loadSitesData } from "../data/sites-data";

const AUGURY = loadAuguryData();

/**
 * The reward-selection tuning from the Tides, Augury, and Sites content
 * modules, for isolated algorithm tests and analysis tools.
 */
export const AUGURY_TUNING = {
  ...buildRewardSelectionData({
    tides: loadTides4Decks(),
    augury: AUGURY,
    sites: loadSitesData(),
  }).tuning,
  categoryDraftSize: AUGURY.archetypes.find(
    (entry) => entry.id === "category_draft_known",
  )?.quantities.chooserSize ?? 4,
  duplicateChooserSize: AUGURY.archetypes.find(
    (entry) => entry.id === "duplicate",
  )?.quantities.chooserSize ?? 3,
  weights: Object.fromEntries(
    AUGURY.archetypes.map((entry) => [entry.id, entry.weight]),
  ),
} as const;
