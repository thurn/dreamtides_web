import type { CharacterRef, ValueExpr } from "../../dsl/types";
import { startContinuous } from "../../continuous/resolve";
import { evaluate, resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/**
 * "… have +N✦" (layer 5): spark the characters have, not spark they gain
 * (rules § Spark). In a static ability (an anthem, a Support benefit) it
 * covers whichever characters match now, with its value read live; as a
 * resolving effect, usually inside `forDuration`, its characters and value
 * are fixed as it resolves.
 */
export interface SparkModifierNode {
  readonly op: "sparkModifier";
  readonly subject: CharacterRef;
  readonly amount: ValueExpr;
}

export const sparkModifierPrimitive = definePrimitive<SparkModifierNode>({
  op: "sparkModifier",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    const amount = evaluate(ctx, node.amount, env);
    const ids = resolveCharacters(ctx, node.subject, env);
    startContinuous(ctx, env, null, ids, ids.map((instance) => ({ kind: "spark", instance, amount })));
  },
  continuous: {
    layer: 5,
    changes(node, env) {
      const amount = env.value(node.amount);
      return env.characters(node.subject).map((instance) => ({ kind: "spark", instance, amount }));
    },
  },
});

export function sparkModifier(subject: CharacterRef, amount: ValueExpr): SparkModifierNode {
  return { op: "sparkModifier", subject, amount };
}
