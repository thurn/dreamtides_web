import { replayIteration } from "../../loops/replay";
import { restartHistory } from "../../loops/tracker";
import type { LoopEndReason } from "../../loops/types";
import type { StepDefinition } from "../types";

/**
 * One iteration of the accepted loop (loops/replay.ts). The repetition ends
 * when the requested count is done, at the battle's iteration cap, or when
 * the iteration stops early; a loop that ran to its count or cap stays on
 * offer. Loop detection starts a new history at the position reached.
 */
export interface LoopIterationStep {
  readonly kind: "loopIteration";
}

export const loopIteration: StepDefinition<LoopIterationStep> = {
  kind: "loopIteration",
  canceller: () => null,
  run(ctx) {
    const { state } = ctx;
    const { run, candidate } = state.loops;
    if (run === null || candidate?.id !== run.loop) {
      throw new Error("loopIteration without an accepted loop");
    }
    const outcome = replayIteration(state, candidate, ctx.catalog);
    ctx.adopt({ ...outcome.state, version: state.version }, outcome.events);
    const { loops } = ctx.state;
    let reason: LoopEndReason | null = outcome.stop;
    const iterations = run.iterations + (reason === null ? 1 : 0);
    if (reason === null) {
      const remaining = run.remaining === "untilVictory" ? run.remaining : run.remaining - 1;
      if (remaining === 0) reason = "completed";
      else if (iterations >= ctx.state.config.loopIterationCap) reason = "iterationCap";
      else loops.run = { loop: run.loop, remaining, iterations };
    }
    if (reason !== null) {
      loops.run = null;
      if (reason !== "completed" && reason !== "iterationCap") loops.candidate = null;
      ctx.emit({ kind: "loopEnded", side: candidate.side, loop: run.loop, iterations, reason });
    }
    restartHistory(ctx.state);
  },
};
