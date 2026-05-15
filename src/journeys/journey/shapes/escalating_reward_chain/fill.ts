// Escalating reward chain shape fill.
//
// Ported from the CLI's `src/journey/shapes/escalating_reward_chain/fill.ts`.
// The tree builder handles every random decision and the precommit bundle
// stays empty — every step is a player choice with deterministic costs and
// rewards, so there's nothing to roll ahead of time.

import type { FilledJourney, ShapeFillArgs } from "../types";
import { buildEscalatingRewardChainTree } from "./tree";

export function escalatingRewardChainFill(args: ShapeFillArgs): FilledJourney {
  return {
    options: [],
    tree: buildEscalatingRewardChainTree(
      args.context,
      args.drawContext,
      args.stage,
    ),
    precommitted: {},
  };
}
