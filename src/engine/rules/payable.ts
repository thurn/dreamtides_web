/**
 * Effects lasting "until the opponent pays N●" (C7). The affected player
 * ends one with the `payToEnd` special action. A duration-bearing effect
 * registers here and keys its changes by the returned id.
 */
import type { AbilitySource, EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState, PayableEffect } from "../state/types";
import type { StepContext } from "../steps/types";
import { spendEnergy } from "./resources";
import { specialActionAllowed } from "./timing";

/**
 * Registers an effect `payer` may end by paying `cost`, changing the
 * characters in `affects`, and returns its id.
 */
export function registerPayable(
  ctx: StepContext,
  payer: Side,
  cost: number,
  source: AbilitySource,
  affects: readonly InstanceId[],
): EffectId {
  const id: EffectId = `e${ctx.state.nextEffect}`;
  ctx.state.nextEffect += 1;
  ctx.state.payable.push({ id, payer, cost, source, affects: [...affects] });
  ctx.emit({ kind: "payableEffectRegistered", effect: id, payer, cost, source, affects: [...affects] });
  return id;
}

export function payableEffect(state: BattleState, id: EffectId): PayableEffect | null {
  return state.payable.find((effect) => effect.id === id) ?? null;
}

/** Ends a payable effect; `paid` when its payer paid to end it. */
export function endPayable(ctx: StepContext, id: EffectId, paid: boolean): void {
  const effect = payableEffect(ctx.state, id);
  if (effect === null) {
    throw new Error(`No payable effect ${id}`);
  }
  ctx.state.payable = ctx.state.payable.filter((entry) => entry.id !== id);
  ctx.emit({ kind: "payableEffectEnded", effect: id, payer: effect.payer, paid });
}

/**
 * The payable effects `side` may pay to end now: wherever it could play a
 * Fast card, never as a response, with enough energy.
 */
export function payableNow(state: BattleState, side: Side): PayableEffect[] {
  if (!specialActionAllowed(state, side)) return [];
  return state.payable.filter(
    (effect) => effect.payer === side && effect.cost <= state.sides[side].currentEnergy,
  );
}

/** Pays to end a payable effect: a special action that does not use the stack. */
export function payToEnd(ctx: StepContext, id: EffectId): void {
  const effect = payableEffect(ctx.state, id);
  if (effect === null) {
    throw new Error(`No payable effect ${id}`);
  }
  spendEnergy(ctx, effect.payer, effect.cost);
  endPayable(ctx, id, true);
}
