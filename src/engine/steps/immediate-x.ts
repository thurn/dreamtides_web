import type { VoidCostBound, CharacterSelector } from "../dsl/types";
import { primitiveDefinition } from "../effects/registry";
import type { EffectNode } from "../effects/types";

function boundNeedsX(bound: VoidCostBound | undefined): boolean {
  return typeof bound === "object" && bound.value === "x";
}

function selectorNeedsX(selector: CharacterSelector): boolean {
  return [selector.sparkAtLeast, selector.sparkAtMost, selector.costAtLeast, selector.costAtMost].some(boundNeedsX) ||
    (selector.anyOf?.some(branch => [branch.sparkAtLeast, branch.sparkAtMost, branch.costAtLeast, branch.costAtMost].some(boundNeedsX)) ?? false);
}

/** Immediate play-time target bounds, including every modal branch, read X before cost planning. */
export function targetsNeedX(effect: EffectNode, seen = new Set<EffectNode>()): boolean {
  if (seen.has(effect)) return false;
  seen.add(effect);
  const definition = primitiveDefinition(effect.op);
  return (definition.targets?.(effect) ?? []).some(spec => {
    if (spec.kind === "target") {
      const alternate = spec.when;
      return selectorNeedsX(spec.selector) || (alternate !== undefined &&
        (selectorNeedsX(alternate.otherwise) || (alternate.condition.cond === "controls" && selectorNeedsX(alternate.condition.selector))));
    }
    return spec.kind === "inZone" && (boundNeedsX(spec.costAtMost) || boundNeedsX(spec.costLessThan));
  }) || (definition.children?.(effect) ?? []).some(child => targetsNeedX(child, seen));
}
