import { advancePhase as advance } from "../../rules/turn";
import type { StepDefinition } from "../types";

/** One phase transition with its rules actions (Dreamwell draw, Draw, Ending cleanup, designations). */
export interface AdvancePhaseStep {
  readonly kind: "advancePhase";
}

export const advancePhase: StepDefinition<AdvancePhaseStep> = {
  kind: "advancePhase",
  canceller: () => null,
  run(ctx) {
    advance(ctx);
  },
};
