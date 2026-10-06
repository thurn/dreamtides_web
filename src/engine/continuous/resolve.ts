/** Continuous primitives resolving as part of an effect, rather than held by a static ability. */
import type { Duration } from "../dsl/types";
import type { EffectEnv } from "../effects/types";
import { startDuration } from "../rules/durations";
import { addFloating } from "../rules/floating";
import type { InstanceId } from "../state/ids";
import type { ContinuousChange } from "../state/types";
import type { StepContext } from "../steps/types";

/**
 * Starts floating continuous changes, one per change, for the node's own
 * duration, else the enclosing `forDuration`'s (shared with every change
 * inside it), else permanently. Their values and cards are fixed now
 * (RD-hv-7x4l.7-1); `affects` are the characters whose changes end with an
 * "until the opponent pays" effect.
 */
export function startContinuous(
  ctx: StepContext,
  env: EffectEnv,
  duration: Duration | null,
  affects: readonly InstanceId[],
  changes: readonly ContinuousChange[],
): void {
  if (changes.length === 0) return;
  const expiry =
    duration === null && env.duration !== null
      ? env.duration.join(ctx, affects)
      : startDuration(ctx, duration ?? "permanent", env.controller, env.source, affects);
  if (expiry === null) return;
  for (const change of changes) addFloating(ctx, { controller: env.controller, source: env.source, expiry, change });
}
