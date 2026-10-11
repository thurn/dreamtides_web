/**
 * Floating effects: changes with a duration (rules § Durations). Spark gained
 * with a duration, floating and delayed triggers, and disabled triggers are
 * records here, as are the continuous changes of continuous/layers.ts; each
 * ends when its expiry is reached, wherever its cards are. The layer
 * evaluation reads the continuous records in timestamp order.
 */
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState, Expiry, FloatingChange, FloatingEffect } from "../state/types";
import type { StepContext } from "../steps/types";
import { floatingEnded } from "./zones";

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

/**
 * Ends every floating effect matching `ends`, in creation order, then does
 * what each one's end does: a card banished until then returns, and a
 * temporary created character ceases to exist (zones.ts `floatingEnded`).
 */
export function endFloating(ctx: StepContext, ends: (effect: FloatingEffect) => boolean): void {
  const ending = ctx.state.floating.filter(ends);
  if (ending.length === 0) return;
  ctx.state.floating = ctx.state.floating.filter((effect) => !ending.includes(effect));
  for (const effect of ending) {
    ctx.emit({ kind: "effectEnded", effect: effect.id });
  }
  for (const effect of ending) floatingEnded(ctx, effect);
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

/**
 * The card a floating change changes, or `null` for a trigger, a cost
 * modifier, a play limit, a play permission or restriction that names no
 * card, or a static-only `reclaimNotBanished`, which never floats. A
 * permission, a restriction, or a `cardCost` change naming a card changes
 * it, so the view and the `effectStarted` event hide it while that card is
 * hidden.
 */
export function changedInstance(change: FloatingChange): InstanceId | null {
  switch (change.kind) {
    case "trigger":
    case "cost":
    case "playLimit":
    case "reclaimNotBanished":
      return null;
    default:
      return change.instance;
  }
}

/**
 * Whether a floating change carries complete legality data of its own: a
 * cost change, a play permission, or a play restriction or limit. A view and
 * a determinization keep it, with its source redacted, when its source is
 * hidden or has ceased to exist, so the cards a player may play and their
 * costs read the same in every determinization (view/view.ts).
 */
export function carriesLegality(change: FloatingChange): boolean {
  switch (change.kind) {
    case "cost":
    case "cardCost":
    case "playFrom":
    case "cannotPlay":
    case "playLimit":
      return true;
    default:
      return false;
  }
}

/** Ends the floating effects that change `id`, when it ceases to exist. */
export function endChangesTo(ctx: StepContext, id: InstanceId): void {
  endFloating(ctx, (effect) => changedInstance(effect.change) === id);
}

/** The floating and delayed triggers `side` controls, in creation order. */
export function floatingTriggers(state: BattleState, side: Side): FloatingEffect[] {
  return state.floating.filter((effect) => effect.controller === side && effect.change.kind === "trigger");
}
