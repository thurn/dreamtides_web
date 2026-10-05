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

/** Spends energy `side` has; callers check that it can pay. */
export function spendEnergy(ctx: StepContext, side: Side, amount: number): void {
  if (amount === 0) {
    return;
  }
  const state = ctx.state.sides[side];
  if (amount > state.currentEnergy) {
    throw new Error(`${side} cannot pay ${String(amount)}●`);
  }
  state.currentEnergy -= amount;
  ctx.emit({ kind: "energyChanged", side, current: state.currentEnergy, max: state.maxEnergy });
}

/**
 * Adds victory points; a total never goes below 0 (C14). The event carries
 * the actual change, and a change of 0 emits none.
 */
export function gainPoints(
  ctx: StepContext,
  side: Side,
  amount: number,
  cause: "challenge" | "fatigue" | "effect",
): void {
  const state = ctx.state.sides[side];
  const before = state.score;
  state.score = Math.max(0, before + amount);
  const change = state.score - before;
  if (change !== 0) {
    ctx.emit({ kind: "pointsScored", side, amount: change, cause });
  }
}

/** `side` suffers Fatigue: the opponent gains 1⍟, then 2⍟, 4⍟, … (rules § Fatigue). */
function suffersFatigue(ctx: StepContext, side: Side): void {
  const sideState = ctx.state.sides[side];
  const points = 2 ** sideState.fatigueCount;
  sideState.fatigueCount += 1;
  ctx.emit({ kind: "fatigue", side, points });
  gainPoints(ctx, opponent(side), points, "fatigue");
}

/** Puts the top card of `side`'s deck into its void; from an empty deck, Fatigue instead. */
export function erodeCard(ctx: StepContext, side: Side): void {
  const top = ctx.state.sides[side].deck[0];
  if (top === undefined) {
    suffersFatigue(ctx, side);
    return;
  }
  moveInstance(ctx, top, "void");
  ctx.emit({ kind: "eroded", side, instance: top });
}

/**
 * Draws one card for `side`. From an empty deck the side suffers Fatigue
 * instead: the opponent gains 1⍟, then 2⍟, 4⍟, … (rules § Fatigue).
 */
export function drawCard(ctx: StepContext, side: Side): void {
  const sideState = ctx.state.sides[side];
  const top = sideState.deck[0];
  if (top === undefined) {
    suffersFatigue(ctx, side);
    return;
  }
  moveInstance(ctx, top, "hand", "bottom");
  ctx.emit({ kind: "cardDrawn", side, instance: top });
  const cardId = ctx.state.instances[top]?.cardId;
  if (cardId !== undefined && ctx.catalog.card(cardId).status === "pending") {
    ctx.emit({ kind: "pendingAbility", side, cardId, instance: top, reason: "drawn" });
  }
}

/** Discards a card from `side`'s hand into its void. */
export function discardCard(ctx: StepContext, side: Side, card: InstanceId): void {
  moveInstance(ctx, card, "void");
  ctx.emit({ kind: "discarded", side, instance: card });
}
