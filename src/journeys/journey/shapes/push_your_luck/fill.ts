// Push-your-luck shape fill.
//
// Ported from the CLI's `src/journey/shapes/push_your_luck/fill.ts`. Emits a
// single `push_choice` precommit envelope listing every Attempt branch so the
// resolver can look up odds, costs, and rewards keyed by branch id when the
// player chooses to push at any level.

import { buildPrecommittedOperations } from "../../operationBuilders";
import type { FilledJourney, ShapeFillArgs } from "../types";
import {
  buildPushYourLuckTree,
  odds,
  pushYourLuckAttemptBranches,
} from "./tree";

export function pushYourLuckFill(args: ShapeFillArgs): FilledJourney {
  const pushTree = buildPushYourLuckTree(args.context, args.drawContext);
  const attemptBranches = pushYourLuckAttemptBranches(pushTree);
  const firstAttempt = attemptBranches[0];
  const precommitted = {
    random: [
      {
        kind: "push_choice",
        bounded: true,
        odds: firstAttempt?.odds ?? odds(50),
        attempts: attemptBranches.map((branch) => ({
          id: branch.id,
          odds: branch.odds,
          costs: branch.costs,
          effects: branch.effects,
        })),
        visibilityPolicy: {
          outcomeVisibility: "visible",
          disclosure:
            "Push-your-luck attempt odds, costs, and rewards are visible on each branch.",
          playerVisible: true,
        },
      },
    ],
  };

  return {
    options: [],
    tree: pushTree,
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
