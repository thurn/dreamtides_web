import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { definePrimitive } from "../types";

/** A static change to the selected Reclaim route's fixed base or whole energy payment. */
export interface CostModifierReclaimNode {
  readonly op: "costModifierReclaim";
  readonly player: PlayerRef;
  readonly mode: "set" | "reduce";
  readonly amount: number;
}

export const costModifierReclaimPrimitive = definePrimitive<CostModifierReclaimNode>({
  op: "costModifierReclaim",
  staticOnly: true,
  resolve() {
    throw new Error("costModifierReclaim is a static ability and never resolves");
  },
  continuous: {
    layer: 6,
    changes(node, env) {
      return [{ kind: "reclaimCost", player: resolvePlayer(env.controller, node.player), mode: node.mode, amount: node.amount }];
    },
  },
});

/** Sets the Reclaim fixed base or reduces its whole chosen payment (RD-hv-umm2.234-1). */
export function costModifierReclaim(
  player: PlayerRef,
  change: { readonly set: number } | { readonly reduce: number },
): CostModifierReclaimNode {
  const mode = "set" in change ? "set" : "reduce";
  const amount = "set" in change ? change.set : change.reduce;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("costModifierReclaim requires a nonnegative whole energy amount");
  }
  return { op: "costModifierReclaim", player, mode, amount };
}
