import auguryJson from "../generated/config/augury-data.json";
import rewardSelectionJson from "../generated/config/reward-selection-data.json";
import { parseAuguryData } from "../data/augury-data";
import { parseRewardSelectionData } from "../data/reward-selection-data";

/** Stable generated configuration for synthetic tests that construct JourneyContent. */
export const CONFIG_DATA_FIXTURE = {
  rewardSelectionData: parseRewardSelectionData(rewardSelectionJson),
  auguryData: parseAuguryData(auguryJson),
} as const;
