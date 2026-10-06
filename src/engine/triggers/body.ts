/** Reading a queued or floating trigger's definition from the catalog. */
import type { EngineCatalog } from "../catalog";
import type { Condition, Trigger } from "../dsl/types";
import { everyNode } from "../effects/interpreter";
import type { FloatingTriggerNode } from "../effects/primitives/floating-trigger";
import type { EffectNode } from "../effects/types";
import { originAbilities } from "../rules/activation";
import type { AbilityOrigin } from "../state/types";

/** What a trigger resolves: its effect, the ability's whole effect tree, and its intervening "if". */
export interface TriggerBody {
  readonly trigger: Trigger;
  readonly effect: EffectNode;
  readonly root: EffectNode;
  readonly condition: Condition | null;
}

/**
 * The trigger at `ability` of `origin`: the triggered ability itself when
 * `node` is `null`, or the floating or delayed trigger node at that index of
 * the ability's effect tree.
 */
export function triggerBody(
  catalog: EngineCatalog,
  origin: AbilityOrigin,
  ability: number,
  node: number | null,
): TriggerBody {
  const definition = originAbilities(catalog, origin)[ability];
  if (definition === undefined || definition.kind === "keyword" || definition.kind === "additionalCost" || definition.kind === "reclaim") {
    throw new Error(`Ability ${String(ability)} of its origin has no effect`);
  }
  if (node === null) {
    if (definition.kind !== "triggered") throw new Error(`Ability ${String(ability)} is not a triggered ability`);
    return { trigger: definition.trigger, effect: definition.effect, root: definition.effect, condition: definition.condition ?? null };
  }
  const found = everyNode(definition.effect)[node];
  if (found?.op !== "floatingTrigger") throw new Error(`Node ${String(node)} of ability ${String(ability)} is not a floating trigger`);
  const floating = found as FloatingTriggerNode;
  return { trigger: floating.trigger, effect: floating.effect, root: definition.effect, condition: null };
}
