import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, PlayerRef } from "../../dsl/types";
import { definePrimitive } from "../types";

/** Every matching play uses this normal fixed energy base while its static source applies. */
export interface CostSetterNode {
  readonly op: "costSetter";
  readonly player: PlayerRef;
  readonly filter: CardFilter;
  readonly amount: number;
}

export const costSetterPrimitive = definePrimitive<CostSetterNode>({
  op: "costSetter",
  staticOnly: true,
  continuous: {
    layer: 6,
    changes(node, env) {
      return [{ kind: "cost", player: resolvePlayer(env.controller, node.player), filter: node.filter,
        amount: node.amount, next: false, mode: "set" }];
    },
  },
});

/** Sets the normal base, preserving X, additional payments and replacement routes (RD-hv-umm2.696-1). */
export function costSetter(player: PlayerRef, filter: CardFilter, amount: number): CostSetterNode {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("costSetter requires a nonnegative whole energy amount");
  }
  return { op: "costSetter", player, filter, amount };
}
