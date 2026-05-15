import { defineShapePlugin } from "../shared";
import { randomRewardsFill } from "./fill";

export const randomRewardsPlugin = defineShapePlugin({
  definition: {
    id: "random_rewards",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Random rewards",
    versionContribution: {
      catalogVersion: "journey-shapes:v26",
      id: "random_rewards",
      topology: "direct_menu",
    },
  },
  fill: randomRewardsFill,
});
