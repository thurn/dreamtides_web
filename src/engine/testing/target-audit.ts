/**
 * The structural check behind primitive play-time targets: a target spec a
 * node holds but its primitive's `targets` hook leaves out is never chosen,
 * so that part of the effect resolves against nothing. Tests run it over
 * every synthetic fixture and every authored entity.
 */
import { abilityEffect } from "../dsl/abilities";
import type { Ability, PlayTimeTarget } from "../dsl/types";
import { everyNode } from "../effects/interpreter";
import { primitiveDefinition } from "../effects/registry";
import type { EffectNode } from "../effects/types";

/** A target spec held by a node whose primitive does not declare it. */
export interface UndeclaredTarget {
  readonly op: string;
  readonly spec: PlayTimeTarget;
}

function isPlayTimeTarget(value: object): value is PlayTimeTarget {
  return (
    "kind" in value && (value.kind === "target" || value.kind === "stackTarget")
  );
}

/**
 * The target and stack target specs in a node's own fields that its
 * primitive's `targets` hook misses. The walk skips the nested effect nodes
 * the primitive names as children, modes, or deferred effects: each is
 * checked as a node of its own.
 */
export function undeclaredTargets(node: EffectNode): PlayTimeTarget[] {
  const definition = primitiveDefinition(node.op);
  const declared = definition.targets?.(node) ?? [];
  const nested = new Set<unknown>([
    ...(definition.children?.(node) ?? []),
    ...(definition.modes?.(node) ?? []),
    ...(definition.deferred?.(node) ?? []),
  ]);
  const found: PlayTimeTarget[] = [];
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || nested.has(value))
      return;
    if (isPlayTimeTarget(value)) {
      if (!declared.includes(value) && !found.includes(value))
        found.push(value);
      return;
    }
    for (const field of Object.values(value)) visit(field);
  };
  for (const field of Object.values(node)) visit(field);
  return found;
}

/** Every undeclared target in the effects of a list of abilities, every mode and deferred effect included. */
export function undeclaredAbilityTargets(
  abilities: readonly Ability[],
): UndeclaredTarget[] {
  return abilities.flatMap((ability) => {
    const effect = abilityEffect(ability);
    return effect === null
      ? []
      : everyNode(effect).flatMap((node) =>
          undeclaredTargets(node).map((spec) => ({ op: node.op, spec })),
        );
  });
}
