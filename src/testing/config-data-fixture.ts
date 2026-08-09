import auguryJson from "../generated/config/augury-data.json";
import rewardSelectionJson from "../generated/config/reward-selection-data.json";
import { parseAuguryData } from "../data/augury-data";
import { parseRewardSelectionData } from "../data/reward-selection-data";
import { gambleFixture } from "./gamble-fixture";
import { transfigurationFixture } from "./transfiguration-fixture";

/** Stable generated configuration for synthetic tests that construct JourneyContent. */
export const CONFIG_DATA_FIXTURE = {
  gambleData: gambleFixture(),
  transfigurationData: transfigurationFixture(),
  rewardSelectionData: parseRewardSelectionData(rewardSelectionJson),
  auguryData: parseAuguryData(auguryJson),
} as const;
