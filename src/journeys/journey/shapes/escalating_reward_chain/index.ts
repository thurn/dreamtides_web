// Escalating reward chain shape plugin.
//
// Ported from the CLI's `src/journey/shapes/escalating_reward_chain/index.ts`.
// Registers the decision-tree validator and tags the shape's supported tags
// and validation rules. The chain's per-tier reward escalation and shared
// reward family are checked by downstream tree validators keyed off the rule
// ids declared here.

import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared";
import { escalatingRewardChainFill } from "./fill";

export const escalatingRewardChainPlugin = defineShapePlugin({
  definition: {
    id: "escalating_reward_chain",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "reward", "cost", "chain", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "chain_rewards_share_family",
      "take_costs_scale_coherently",
    ],
    debugLabel: "Escalating reward chain",
    versionContribution: versionContribution(
      "escalating_reward_chain",
      "decision_tree",
    ),
  },
  validators: [decisionTreeValidator],
  fill: escalatingRewardChainFill,
});
