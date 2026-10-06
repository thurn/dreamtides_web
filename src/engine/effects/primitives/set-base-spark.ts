import type { CharacterRef, Duration, ValueExpr } from "../../dsl/types";
import { startContinuous } from "../../continuous/resolve";
import { evaluate, resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Its base ✦ becomes N" (layer 4): spark modifications still apply on top.
 * The latest setting wins (timestamp order). `duration` `null` takes the
 * enclosing `forDuration`'s, else lasts permanently.
 */
export interface SetBaseSparkNode {
  readonly op: "setBaseSpark";
  readonly subject: CharacterRef;
  readonly value: ValueExpr;
  readonly duration: Duration | null;
}

export const setBaseSparkPrimitive = definePrimitive<SetBaseSparkNode>({
  op: "setBaseSpark",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    const value = evaluate(ctx, node.value, env);
    const ids = resolveCharacters(ctx, node.subject, env);
    startContinuous(ctx, env, node.duration, ids, ids.map((instance) => ({ kind: "baseSpark", instance, value })));
  },
  continuous: {
    layer: 4,
    changes(node, env) {
      const value = env.value(node.value);
      return env.characters(node.subject).map((instance) => ({ kind: "baseSpark", instance, value }));
    },
  },
});

export function setBaseSpark(subject: CharacterRef, value: ValueExpr, duration: Duration | null = null): SetBaseSparkNode {
  return { op: "setBaseSpark", subject, value, duration };
}
