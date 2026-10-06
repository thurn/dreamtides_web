import type { Duration } from "../../dsl/types";
import { primitiveDefinition } from "../registry";
import { definePrimitive, type EffectEnv, type EffectNode } from "../types";

/**
 * "Until end of turn, …": the continuous primitives inside resolve as
 * floating changes lasting `duration`, with their characters and values
 * fixed as they resolve (RD-hv-7x4l.7-1).
 */
export interface ForDurationNode {
  readonly op: "forDuration";
  readonly duration: Duration;
  readonly effect: EffectNode;
}

export const forDurationPrimitive = definePrimitive<ForDurationNode>({
  op: "forDuration",
  children: (node) => [node.effect],
  resolve(ctx, node, env) {
    const inner: EffectEnv = {
      ...env,
      duration: node.duration,
      run(effect) {
        primitiveDefinition(effect.op).resolve(ctx, effect, inner);
      },
    };
    inner.run(node.effect);
  },
});

export function forDuration(duration: Duration, effect: EffectNode): ForDurationNode {
  return { op: "forDuration", duration, effect };
}
