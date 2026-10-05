import type { AbilitySource, EffectId, InstanceId, Side, Slot } from "../state/ids";
import { sourceKey } from "../state/ids";

/**
 * A top-level action. Actions carry no choices: every choice an action needs
 * is a prompt raised inside its step.
 */
export type Action =
  | { readonly kind: "play"; readonly card: InstanceId; readonly from: "hand" }
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

/** Whether two actions are the same action. */
export function actionsEqual(a: Action, b: Action): boolean {
  switch (a.kind) {
    case "play":
      return b.kind === "play" && a.card === b.card && a.from === b.from;
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
