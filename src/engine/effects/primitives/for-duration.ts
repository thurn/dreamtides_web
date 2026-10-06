import type { Duration } from "../../dsl/types";
import { sharedDuration } from "../../rules/durations";
import { primitiveDefinition } from "../registry";
import { definePrimitive, type EffectEnv, type EffectNode } from "../types";

/**
 * "Until end of turn, …": the continuous primitives inside resolve as
 * floating changes lasting `duration`, with their characters and values
 * fixed as they resolve (RD-hv-7x4l.7-1). They share the duration: "until
 * the opponent pays, …" is one payable effect, and paying once ends every
 * change the node made.
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
    const duration = sharedDuration(node.duration, env.controller, env.source);
    const inner: EffectEnv = {
      ...env,
      duration,
      run(effect) {
        primitiveDefinition(effect.op).resolve(ctx, effect, inner);
      },
    };
    inner.run(node.effect);
    duration.finish(ctx);
  },
});

export function forDuration(duration: Duration, effect: EffectNode): ForDurationNode {
  return { op: "forDuration", duration, effect };
}
