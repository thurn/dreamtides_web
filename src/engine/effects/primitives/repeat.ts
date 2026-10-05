import type { ValueExpr } from "../../dsl/types";
import { evaluate } from "../interpreter";
import { definePrimitive, type EffectNode } from "../types";

/** "Do this N times." The count is locked when the effect resolves. */
export interface RepeatNode {
  readonly op: "repeat";
  readonly times: ValueExpr;
  readonly effect: EffectNode;
}

export const repeatPrimitive = definePrimitive<RepeatNode>({
  op: "repeat",
  children: (node) => [node.effect],
  resolve(ctx, node, env) {
    const times = evaluate(ctx, node.times, env);
    for (let index = 0; index < times; index++) env.run(node.effect);
  },
});

export function repeat(times: ValueExpr, effect: EffectNode): RepeatNode {
  return { op: "repeat", times, effect };
}
