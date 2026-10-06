/** Turning a DSL duration into a floating effect's expiry as the effect resolves (rules § Durations). */
import type { Duration } from "../dsl/types";
import type { SharedDuration } from "../effects/types";
import type { AbilitySource, EffectId, InstanceId, Side } from "../state/ids";
import { opponent, sourceInstance } from "../state/ids";
import type { Expiry } from "../state/types";
import type { StepContext } from "../steps/types";
import { mintEffectId } from "./floating";
import { linkedFloating, registerPayable } from "./payable";

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

/**
 * The duration of one `forDuration` node, for an effect `controller`
 * controls from `source`. Each change inside the node starts its own expiry
 * as `startDuration` would, except "until the opponent pays": the first
 * change mints the payable effect's id, every change links to it, and as the
 * node finishes it registers once, affecting every character the changes
 * affect that still exists. It does not register when no change is linked
 * to it any more.
 */
export function sharedDuration(duration: Duration, controller: Side, source: AbilitySource): SharedDuration {
  let payable: { readonly id: EffectId; readonly affects: InstanceId[] } | null = null;
  return {
    join(ctx, affects) {
      if (typeof duration === "string") return startDuration(ctx, duration, controller, source, affects);
      payable ??= { id: mintEffectId(ctx.state), affects: [] };
      for (const id of affects) {
        if (!payable.affects.includes(id)) payable.affects.push(id);
      }
      return { at: "paid", effect: payable.id };
    },
    finish(ctx) {
      if (typeof duration === "string" || payable === null || !linkedFloating(ctx.state, payable.id)) return;
      const existing = payable.affects.filter((id) => ctx.state.instances[id] !== undefined);
      registerPayable(ctx, opponent(controller), duration.cost, source, existing, payable.id);
    },
  };
}
