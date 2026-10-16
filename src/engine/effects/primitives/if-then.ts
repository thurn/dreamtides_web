import type { ResolvingEffect } from "../registry";
import type { Condition } from "../../dsl/types";
import { checkCondition, resolveChosenEffect } from "../interpreter";
import { definePrimitive, type ResolvingPrimitiveDefinition } from "../types";

/** "If …, …; otherwise …", checked when the effect resolves. */
export interface IfThenNode {
  readonly op: "ifThen";
  readonly condition: Condition;
  readonly then: ResolvingEffect;
  readonly otherwise: ResolvingEffect | null;
}

export const ifThenPrimitive: ResolvingPrimitiveDefinition<IfThenNode> = definePrimitive<IfThenNode>({
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

export function ifThen(condition: Condition, then: ResolvingEffect, otherwise: ResolvingEffect | null = null): IfThenNode {
  return { op: "ifThen", condition, then, otherwise };
}
