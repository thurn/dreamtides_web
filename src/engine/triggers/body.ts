/** Reading a queued or floating trigger's definition from the catalog. */
import type { EngineCatalog } from "../catalog";
import { abilityEffect } from "../dsl/abilities";
import type { Condition, NamedTrigger, Trigger } from "../dsl/types";
import { everyNode } from "../effects/interpreter";
import { primitiveDefinition } from "../effects/registry";
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
  const root = definition === undefined ? null : abilityEffect(definition);
  if (definition === undefined || root === null) throw new Error(`Ability ${String(ability)} of its origin has no effect`);
  if (node === null) {
    if (definition.kind !== "triggered") throw new Error(`Ability ${String(ability)} is not a triggered ability`);
    return { trigger: definition.trigger, effect: root, root, condition: definition.condition ?? null };
  }
  const found = everyNode(root)[node];
  if (found?.op !== "floatingTrigger") throw new Error(`Node ${String(node)} of ability ${String(ability)} is not a floating trigger`);
  const floating = found as FloatingTriggerNode;
  return { trigger: floating.trigger, effect: floating.effect, root, condition: null };
}

/** Whether this resolving body reads its causing occurrence; a floating body belongs to its future occasion. */
export function readsImmediateRepeat(node: EffectNode, seen = new Set<EffectNode>()): boolean {
  if (seen.has(node) || node.op === "floatingTrigger") return false;
  seen.add(node);
  if (node.op === "repeatTriggeringAbility") return true;
  const definition = primitiveDefinition(node.op);
  return [...definition.children?.(node) ?? [], ...definition.deferred?.(node) ?? []].some(child => readsImmediateRepeat(child, seen));
}

/** Whether any branch of a trigger describes this named occasion. */
export function hasNamedTrigger(trigger: Trigger, named: NamedTrigger): boolean {
  return trigger.on === named || (trigger.on === "either" && trigger.triggers.some((branch) => hasNamedTrigger(branch, named)));
}

/**
 * Whether a captured occurrence has an immutable repeat allowance. `body`
 * comes from `triggerBody` for the same origin, ability and node. Current
 * source disabling and intervening conditions are separate mutable checks.
 */
export function hasImmutableRepeatAllowance(
  catalog: EngineCatalog,
  origin: AbilityOrigin,
  ability: number,
  node: number | null,
  body: TriggerBody,
): boolean {
  if (node === null) {
    const definition = originAbilities(catalog, origin)[ability];
    return !(definition?.kind === "triggered" && definition.oncePerTurn === true);
  }
  return !(everyNode(body.root)[node] as FloatingTriggerNode).once;
}

/** A queued static threshold reaction has its own kind, with no floating-trigger node. */
export function ruleReactionBody(catalog: EngineCatalog, origin: AbilityOrigin, ability: number): Pick<TriggerBody, "effect" | "root" | "condition"> {
  const definition = originAbilities(catalog, origin)[ability];
  if (definition?.kind !== "static" || definition.effect.op !== "ruleModifier") throw new Error("Invalid rule reaction ability");
  const root = definition.effect;
  if (root.rule !== "dawnThreshold") throw new Error("Invalid rule reaction instruction");
  return { effect: root.effect, root, condition: null };
}
