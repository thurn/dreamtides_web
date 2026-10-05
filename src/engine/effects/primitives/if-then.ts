import type { Condition } from "../../dsl/types";
import { checkCondition } from "../interpreter";
import { definePrimitive, type EffectNode } from "../types";

/** "If …, …; otherwise …", checked when the effect resolves. */
export interface IfThenNode {
  readonly op: "ifThen";
  readonly condition: Condition;
  readonly then: EffectNode;
  readonly otherwise: EffectNode | null;
}

export const ifThenPrimitive = definePrimitive<IfThenNode>({
  op: "ifThen",
  children: (node) => (node.otherwise === null ? [node.then] : [node.then, node.otherwise]),
  resolve(ctx, node, env) {
    if (checkCondition(ctx, node.condition, env)) {
      env.run(node.then);
    } else if (node.otherwise !== null) {
      env.run(node.otherwise);
    }
  },
});

export function ifThen(condition: Condition, then: EffectNode, otherwise: EffectNode | null = null): IfThenNode {
  return { op: "ifThen", condition, then, otherwise };
}
