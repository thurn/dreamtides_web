import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { StepContext } from "../steps/types";
import { moveInstance } from "./zones";

export function setEnergy(ctx: StepContext, side: Side, current: number, max: number): void {
  const state = ctx.state.sides[side];
  state.maxEnergy = Math.max(0, max);
  state.currentEnergy = Math.max(0, current);
  ctx.emit({ kind: "energyChanged", side, current: state.currentEnergy, max: state.maxEnergy });
}

/** Adds victory points; a total never goes below 0 (C14). */
export function gainPoints(
  ctx: StepContext,
  side: Side,
  amount: number,
  cause: "challenge" | "fatigue",
): void {
  if (amount === 0) {
    return;
  }
  const state = ctx.state.sides[side];
  state.score = Math.max(0, state.score + amount);
  ctx.emit({ kind: "pointsScored", side, amount, cause });
}

/**
 * Draws one card for `side`. From an empty deck the side suffers Fatigue
 * instead: the opponent gains 1⍟, then 2⍟, 4⍟, … (rules § Fatigue).
 */
export function drawCard(ctx: StepContext, side: Side): void {
  const sideState = ctx.state.sides[side];
  const top = sideState.deck[0];
  if (top === undefined) {
    const points = 2 ** sideState.fatigueCount;
    sideState.fatigueCount += 1;
    ctx.emit({ kind: "fatigue", side, points });
    gainPoints(ctx, opponent(side), points, "fatigue");
    return;
  }
  moveInstance(ctx, top, "hand", "bottom");
  ctx.emit({ kind: "cardDrawn", side, instance: top });
}

/** Discards a card from `side`'s hand into its void. */
export function discardCard(ctx: StepContext, side: Side, card: InstanceId): void {
  moveInstance(ctx, card, "void");
  ctx.emit({ kind: "discarded", side, instance: card });
}
