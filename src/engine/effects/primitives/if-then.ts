import type { Condition } from "../../dsl/types";
import { checkCondition, resolveChosenEffect } from "../interpreter";
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
  deferConditionalChoices: true,
  children: (node) => (node.otherwise === null ? [node.then] : [node.then, node.otherwise]),
  resolve(ctx, node, env) {
    const branch = checkCondition(ctx, node.condition, env) ? node.then : node.otherwise;
    if (branch === null) return;
    if (env.resolutionChoiceScope === undefined) env.run(branch);
    else resolveChosenEffect(ctx, branch, env, true);
  },
});

export function ifThen(condition: Condition, then: EffectNode, otherwise: EffectNode | null = null): IfThenNode {
  return { op: "ifThen", condition, then, otherwise };
}
