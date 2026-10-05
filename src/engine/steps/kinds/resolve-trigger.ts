import { resolveQueuedTrigger } from "../../triggers/resolve";
import type { StepDefinition } from "../types";

/**
 * Resolves the first queued trigger (D14). One step per trigger keeps its
 * prompts cheap to replay; triggers it fires join the end of the queue.
 */
export interface ResolveTriggerStep {
  readonly kind: "resolveTrigger";
}

export const resolveTrigger: StepDefinition<ResolveTriggerStep> = {
  kind: "resolveTrigger",
  canceller: () => null,
  run(ctx) {
    const trigger = ctx.state.triggerQueue.shift();
    if (trigger === undefined) {
      throw new Error("resolveTrigger with an empty trigger queue");
    }
    resolveQueuedTrigger(ctx, trigger);
  },
};
