/**
 * Floating effects: changes with a duration (rules § Durations). Spark gained
 * with a duration, floating and delayed triggers, and disabled triggers are
 * records here; each ends when its expiry is reached, wherever its cards are.
 * Continuous effects read the same records, in timestamp order.
 */
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState, Expiry, FloatingEffect } from "../state/types";
import type { StepContext } from "../steps/types";

/** Mints an effect id; payable and floating effects share the counter. */
export function mintEffectId(state: BattleState): EffectId {
  const id: EffectId = `e${state.nextEffect}`;
  state.nextEffect += 1;
  return id;
}

/** Starts a floating effect and returns its id. */
export function addFloating(
  ctx: StepContext,
  effect: Omit<FloatingEffect, "id" | "timestamp">,
): EffectId {
  const id = mintEffectId(ctx.state);
  ctx.state.floating.push({ ...effect, id, timestamp: ctx.state.clock });
  ctx.emit({
    kind: "effectStarted",
    effect: id,
    controller: effect.controller,
    source: effect.source,
    expiry: effect.expiry,
    change: effect.change,
  });
  return id;
}

/** Ends every floating effect matching `ends`, in creation order. */
export function endFloating(ctx: StepContext, ends: (effect: FloatingEffect) => boolean): void {
  const ending = ctx.state.floating.filter(ends);
  if (ending.length === 0) return;
  ctx.state.floating = ctx.state.floating.filter((effect) => !ending.includes(effect));
  for (const effect of ending) {
    ctx.emit({ kind: "effectEnded", effect: effect.id });
  }
}

/** Ends the floating effects whose expiry is `at` this boundary. */
export function expireAt(ctx: StepContext, boundary: Expiry): void {
  endFloating(ctx, (effect) => sameBoundary(effect.expiry, boundary));
}

function sameBoundary(expiry: Expiry, boundary: Expiry): boolean {
  switch (boundary.at) {
    case "turnStart":
      return expiry.at === "turnStart" && expiry.side === boundary.side;
    case "sourceLeavesPlay":
      return expiry.at === "sourceLeavesPlay" && expiry.source === boundary.source;
    case "paid":
      return expiry.at === "paid" && expiry.effect === boundary.effect;
    default:
      return expiry.at === boundary.at;
  }
}

/** Ends the floating effects that change `id`, when it ceases to exist. */
export function endChangesTo(ctx: StepContext, id: InstanceId): void {
  endFloating(ctx, (effect) => effect.change.kind !== "trigger" && effect.change.instance === id);
}

/** Spark the instance has gained with a duration, from its floating effects. */
export function floatingSpark(state: BattleState, id: InstanceId): number {
  let total = 0;
  for (const effect of state.floating) {
    if (effect.change.kind === "spark" && effect.change.instance === id) total += effect.change.amount;
  }
  return total;
}

/** The floating and delayed triggers `side` controls, in creation order. */
export function floatingTriggers(state: BattleState, side: Side): FloatingEffect[] {
  return state.floating.filter((effect) => effect.controller === side && effect.change.kind === "trigger");
}
