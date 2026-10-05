/** Turning a DSL duration into a floating effect's expiry as the effect resolves (rules § Durations). */
import type { Duration } from "../dsl/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent, sourceInstance } from "../state/ids";
import type { Expiry } from "../state/types";
import type { StepContext } from "../steps/types";
import { registerPayable } from "./payable";

/**
 * The expiry of a change with `duration`, made by an effect `controller`
 * controls from `source` and changing `affects`; `null` when the duration is
 * already over, so the change does not happen. "While this is in play" is
 * over when the source is not in play (an emblem always is); "until the
 * opponent pays" registers its payable effect here.
 */
export function startDuration(
  ctx: StepContext,
  duration: Duration,
  controller: Side,
  source: AbilitySource,
  affects: readonly InstanceId[],
): Expiry | null {
  if (typeof duration !== "string") {
    const effect = registerPayable(ctx, opponent(controller), duration.cost, source, affects);
    return { at: "paid", effect };
  }
  switch (duration) {
    case "permanent":
      return { at: "never" };
    case "untilEndOfTurn":
      return { at: "endOfTurn" };
    case "untilYourNextTurn":
      return { at: "turnStart", side: controller };
    case "untilNextDay":
      return { at: "nextDay" };
    case "whileSourceInPlay": {
      const instance = sourceInstance(source);
      if (instance === null) return { at: "never" };
      return ctx.state.instances[instance]?.zone === "play" ? { at: "sourceLeavesPlay", source: instance } : null;
    }
  }
}
