import type { Duration, Trigger } from "../../dsl/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { everyNode } from "../interpreter";
import { definePrimitive, type EffectNode } from "../types";

/**
 * "Until end of turn, when …, …" (a floating trigger) or "The next time …,
 * …" (a delayed trigger, `once`: it ends as it triggers). It lasts for
 * `duration`; its effect resolves later, as a queued trigger whose choices
 * are made then.
 */
export interface FloatingTriggerNode {
  readonly op: "floatingTrigger";
  readonly trigger: Trigger;
  readonly effect: EffectNode;
  readonly once: boolean;
  readonly duration: Duration;
}

export const floatingTriggerPrimitive = definePrimitive<FloatingTriggerNode>({
  op: "floatingTrigger",
  deferred: (node) => [node.effect],
  resolve(ctx, node, env) {
    const index = everyNode(env.root).indexOf(node);
    if (index < 0) throw new Error("A floating trigger is not part of its ability's effect");
    const expiry = startDuration(ctx, node.duration, env.controller, env.source, []);
    if (expiry === null) return;
    addFloating(ctx, {
      controller: env.controller,
      source: env.source,
      expiry,
      change: { kind: "trigger", ref: { origin: env.origin, ability: env.ability, node: index }, once: node.once },
    });
  },
});

/** "Until end of turn, when `trigger`, `effect`": triggers each time while it lasts. */
export function floating(trigger: Trigger, effect: EffectNode, duration: Duration = "untilEndOfTurn"): FloatingTriggerNode {
  return { op: "floatingTrigger", trigger, effect, once: false, duration };
}

/** "The next time `trigger`, `effect`": triggers once, if it does before `duration` ends. */
export function delayed(trigger: Trigger, effect: EffectNode, duration: Duration = "permanent"): FloatingTriggerNode {
  return { op: "floatingTrigger", trigger, effect, once: true, duration };
}
