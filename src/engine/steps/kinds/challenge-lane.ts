import { resolveLane } from "../../rules/challenge";
import { FRONT_RANK_SIZE } from "../../state/ids";
import type { StepDefinition } from "../types";

/** Resolves one front-rank lane of the Challenge phase, F0→F8. */
export interface ChallengeLaneStep {
  readonly kind: "challengeLane";
  readonly lane: number;
}

export const challengeLane: StepDefinition<ChallengeLaneStep> = {
  kind: "challengeLane",
  run(ctx, step) {
    resolveLane(ctx, step.lane);
    const next = step.lane + 1;
    ctx.state.turn.challengeLane = next < FRONT_RANK_SIZE ? next : null;
  },
};
