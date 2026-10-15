import { resolveLane, settleScoreGroups } from "../../rules/challenge";
import { FRONT_RANK_SIZE } from "../../state/ids";
import type { StepDefinition } from "../types";

/** Resolves one front-rank lane of the Challenge phase, F0→F8. */
export interface ChallengeLaneStep {
  readonly kind: "challengeLane";
  readonly lane: number;
}

export const challengeLane: StepDefinition<ChallengeLaneStep> = {
  kind: "challengeLane",
  canceller: () => null,
  run(ctx, step) {
    // A legacy snapshot before the first lane has an exactly empty cohort.
    if (step.lane === 0 && ctx.state.challenge !== null) ctx.state.challenge.scoring ??= { scorers: [], settled: false };
    resolveLane(ctx, step.lane);
    if (step.lane === FRONT_RANK_SIZE - 1) settleScoreGroups(ctx);
    const next = step.lane + 1;
    ctx.state.turn.challengeLane = next < FRONT_RANK_SIZE ? next : null;
  },
};
