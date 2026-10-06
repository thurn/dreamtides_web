import type { CharacterRef, NamedTrigger } from "../../dsl/types";
import { triggerNamed } from "../../triggers/matcher";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/**
 * "Trigger this character's ▸Materialized ability": queues the character's
 * abilities with that named trigger outside their occasion. They resolve
 * after the current effect, like any trigger.
 */
export interface TriggerAbilityNode {
  readonly op: "triggerAbility";
  readonly subject: CharacterRef;
  readonly trigger: NamedTrigger;
}

export const triggerAbilityPrimitive = definePrimitive<TriggerAbilityNode>({
  op: "triggerAbility",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) triggerNamed(ctx, id, node.trigger);
  },
});

export function triggerAbility(subject: CharacterRef, trigger: NamedTrigger): TriggerAbilityNode {
  return { op: "triggerAbility", subject, trigger };
}
