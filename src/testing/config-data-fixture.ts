import auguryJson from "../generated/config/augury-data.json";
import sitesJson from "../generated/config/sites-data.json";
import tidesJson from "../generated/config/tides4-data.json";
import { parseAuguryData } from "../data/augury-data";
import { buildRewardSelectionData } from "../data/reward-selection-data";
import { parseSitesData } from "../data/sites-data";
import { validateTides4Decks } from "../draft/pool/tides4-io";
import { gambleFixture } from "./gamble-fixture";
import { transfigurationFixture } from "./transfiguration-fixture";

/** Stable generated configuration for synthetic tests that construct JourneyContent. */
export const CONFIG_DATA_FIXTURE = {
  gambleData: gambleFixture(),
  transfigurationData: transfigurationFixture(),
  rewardSelectionData: buildRewardSelectionData({
    tides: validateTides4Decks(tidesJson),
    augury: parseAuguryData(auguryJson),
    sites: parseSitesData(sitesJson),
  }),
  auguryData: parseAuguryData(auguryJson),
} as const;
