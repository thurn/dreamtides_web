import { defineShapePlugin, versionContribution } from "../shared";
import { takeAnyNumberFill } from "./fill";

export const takeAnyNumberPlugin = defineShapePlugin({
  definition: {
    id: "take_any_number",
    topology: "repeatable_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Take any number",
    versionContribution: versionContribution("take_any_number", "repeatable_menu"),
  },
  fill: takeAnyNumberFill,
});
