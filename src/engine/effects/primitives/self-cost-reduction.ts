import type { ValueExpr } from "../../dsl/types";
import { sourceInstance } from "../../state/ids";
import { definePrimitive } from "../types";

/** A live reduction of the physical source's energy cost, held by a static ability. */
export interface SelfCostReductionNode {
  readonly op: "selfCostReduction";
  readonly amount: ValueExpr;
}

function reductionAmount(amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("selfCostReduction takes a non-negative whole energy amount");
  return amount;
}

export const selfCostReductionPrimitive = definePrimitive<SelfCostReductionNode>({
  op: "selfCostReduction",
  staticOnly: true,
  resolve() {
    throw new Error("selfCostReduction is a static ability and never resolves");
  },
  continuous: {
    layer: 6,
    changes(node, env) {
      const instance = sourceInstance(env.source);
      if (instance === null) return [];
      return [{ kind: "cardCost", instance, mode: "reduce", amount: reductionAmount(env.value(node.amount)) }];
    },
  },
});

/** "This character costs N● less": N is read live from the source's controller and earlier layers. */
export function selfCostReduction(amount: ValueExpr): SelfCostReductionNode {
  if (typeof amount === "number") reductionAmount(amount);
  return { op: "selfCostReduction", amount };
}
