import type { InstanceId, Side, Slot } from "../state/ids";

/**
 * A top-level action. Actions carry no choices: every choice an action needs
 * is a prompt raised inside its step.
 */
export type Action =
  | { readonly kind: "play"; readonly card: InstanceId; readonly from: "hand" }
  | { readonly kind: "reposition"; readonly card: InstanceId; readonly to: Slot }
  | { readonly kind: "pass" };

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
    case "reposition":
      return (
        b.kind === "reposition" &&
        a.card === b.card &&
        a.to.rank === b.to.rank &&
        a.to.index === b.to.index
      );
    case "pass":
      return b.kind === "pass";
  }
}
