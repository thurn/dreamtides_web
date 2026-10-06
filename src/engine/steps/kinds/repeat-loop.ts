import type { LoopId } from "../../loops/types";
import type { StepDefinition } from "../types";

/**
 * Accepts the loop on offer (rules § Optional Loops): it is repeated `count`
 * more times, or until the battle ends, one `loopIteration` step per
 * iteration. Nothing else changes.
 */
export interface RepeatLoopStep {
  readonly kind: "repeatLoop";
  readonly loop: LoopId;
  readonly count: number | "untilVictory";
}

export const repeatLoop: StepDefinition<RepeatLoopStep> = {
  kind: "repeatLoop",
  canceller: () => null,
  run(ctx, step) {
    const { loops, config } = ctx.state;
    const candidate = loops.candidate;
    if (candidate?.id !== step.loop || loops.run !== null) {
      throw new Error(`Loop ${step.loop} is not on offer`);
    }
    if (step.count !== "untilVictory" && !(Number.isInteger(step.count) && step.count >= 1 && step.count <= config.loopIterationCap)) {
      throw new Error(`A loop cannot repeat ${String(step.count)} times`);
    }
    loops.run = { loop: step.loop, remaining: step.count, iterations: 0 };
    ctx.emit({ kind: "loopStarted", side: candidate.side, loop: step.loop, count: step.count });
  },
};
