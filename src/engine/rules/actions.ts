import type { AbilitySource, EffectId, InstanceId, Side, Slot } from "../state/ids";
import { BACK_RANK_SIZE, sourceKey } from "../state/ids";
import type { BattleState } from "../state/types";

/**
 * A top-level action. Actions carry no choices: every choice an action needs
 * is a prompt raised inside its step.
 */
export type Action =
  /**
   * Play a card from the hand holding it, or from its owner's void by
   * Reclaim. A UI drop may name the open back-rank `slot` a character
   * enters; legal actions never carry one.
   */
  | { readonly kind: "play"; readonly card: InstanceId; readonly from: "hand" | "void"; readonly slot?: Slot }
  | { readonly kind: "activate"; readonly source: AbilitySource; readonly ability: number }
  | { readonly kind: "reposition"; readonly card: InstanceId; readonly to: Slot }
  /** Pass priority, or end the current Day, Dusk, or Night. */
  | { readonly kind: "pass" }
  /** Pay to end an effect lasting "until the opponent pays N●" (C7). */
  | { readonly kind: "payToEnd"; readonly effect: EffectId };

/**
 * The pending top-level decision: `main` while a side may act in its Day,
 * Dusk, or Night window with an empty stack; `respond` while a side holds
 * priority over a non-empty stack.
 */
export interface Decision {
  readonly kind: "main" | "respond";
  readonly side: Side;
}

/**
 * Whether `action` is the legal action `legal`, or that play dropped on an
 * open back-rank position of the playing side.
 */
export function allowedBy(legal: Action, action: Action, state: BattleState): boolean {
  if (legal.kind !== "play" || action.kind !== "play" || action.slot === undefined || legal.slot !== undefined) {
    return actionsEqual(legal, action);
  }
  const side = state.instances[action.card]?.controller;
  return (
    actionsEqual(legal, { kind: "play", card: action.card, from: action.from }) &&
    side !== undefined &&
    action.slot.rank === "back" &&
    action.slot.index >= 0 &&
    action.slot.index < BACK_RANK_SIZE &&
    state.sides[side].backRank[action.slot.index] === null
  );
}

/** Whether two actions are the same action. */
export function actionsEqual(a: Action, b: Action): boolean {
  switch (a.kind) {
    case "play":
      return (
        b.kind === "play" &&
        a.card === b.card &&
        a.from === b.from &&
        a.slot?.rank === b.slot?.rank &&
        a.slot?.index === b.slot?.index
      );
    case "activate":
      return b.kind === "activate" && sourceKey(a.source) === sourceKey(b.source) && a.ability === b.ability;
    case "reposition":
      return (
        b.kind === "reposition" &&
        a.card === b.card &&
        a.to.rank === b.to.rank &&
        a.to.index === b.to.index
      );
    case "pass":
      return b.kind === "pass";
    case "payToEnd":
      return b.kind === "payToEnd" && a.effect === b.effect;
  }
}
