// Random pool draws shape plugin.
//
// Ported from the CLI's `src/journey/shapes/random_pool_draws/index.ts`.
// Registers the shape's tag set and base validation rules; the per-level Stop
// / Draw topology and the shared reward pool flow through the common
// decision-tree validator via the generic precommit envelope checks.

import { defineShapePlugin } from "../shared";
import { randomPoolDrawsFill } from "./fill";

export const randomPoolDrawsPlugin = defineShapePlugin({
  definition: {
    id: "random_pool_draws",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Random pool draws",
    versionContribution: {
      catalogVersion: "journey-shapes:v26",
      id: "random_pool_draws",
      topology: "decision_tree",
    },
  },
  fill: randomPoolDrawsFill,
});
