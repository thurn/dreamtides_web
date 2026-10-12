import type { BoundValue, CharacterSelector } from "../../dsl/types";
import { primitiveDefinition } from "../../effects/registry";
import type { EffectNode } from "../../effects/types";
import { choosePlayTime, purposeOf } from "../../effects/interpreter";
import { abilityOrigin, activatedAbilityAt, canActivate, oncePerTurnKey, sourceController } from "../../rules/activation";
import type { PromptRole } from "../../prompts/types";
import { prepareCostX, payCosts, planCosts } from "../../rules/costs";
import { slotOf } from "../../rules/zones";
import type { AbilitySource } from "../../state/ids";
import { opponent, sourceInstance } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Activates an ability of a card in play, of a card in its owner's void
 * whose ability works there, or of an emblem: play-time choices
 * (X and any mandatory card-cost capture needed by targeting, then modes,
 * then targets, then the costs' alternatives, optional
 * costs, and cards), then the commit point,
 * then the costs, then the ability goes on the stack and the opponent
 * receives priority (D13). The stack item keeps the source's ability
 * origin as activated, so it resolves as activated even after its card has
 * left play or the void.
 */
export interface ActivateStep {
  readonly kind: "activate";
  readonly source: AbilitySource;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
}

function boundNeedsX(bound: BoundValue | undefined): boolean {
  return typeof bound === "object" && bound.value === "x";
}

function selectorNeedsX(selector: CharacterSelector): boolean {
  return [selector.sparkAtLeast, selector.sparkAtMost, selector.costAtLeast, selector.costAtMost].some(boundNeedsX) ||
    (selector.anyOf?.some(branch => [branch.sparkAtLeast, branch.sparkAtMost, branch.costAtLeast, branch.costAtMost].some(boundNeedsX)) ?? false);
}

/** Immediate play-time target bounds, including every modal branch, read X before cost planning. */
function targetsNeedX(effect: EffectNode, seen = new Set<EffectNode>()): boolean {
  if (seen.has(effect)) return false;
  seen.add(effect);
  const definition = primitiveDefinition(effect.op);
  return (definition.targets?.(effect) ?? []).some(spec => {
    if (spec.kind === "target") {
      const alternate = spec.when;
      return selectorNeedsX(spec.selector) || (alternate !== undefined &&
        (selectorNeedsX(alternate.otherwise) || (alternate.condition.cond === "controls" && selectorNeedsX(alternate.condition.selector))));
    }
    return spec.kind === "inZone" && boundNeedsX(spec.costAtMost);
  }) || (definition.children?.(effect) ?? []).some(child => targetsNeedX(child, seen));
}

export const activate: StepDefinition<ActivateStep> = {
  kind: "activate",
  canceller: (state, step) => sourceController(state, step.source),
  hasCommitPoint: true,
  run(ctx, step) {
    const { state, catalog } = ctx;
    const side = sourceController(state, step.source);
    const origin = abilityOrigin(state, step.source);
    const ability = activatedAbilityAt(state, catalog, step.source, step.ability);
    if (side === null || origin === null || ability === null || !canActivate(state, catalog, side, step.source, step.ability)) {
      throw new Error(`Ability ${String(step.ability)} cannot be activated now`);
    }
    const purpose = (role: PromptRole) => purposeOf(step.source, origin, step.ability, role);
    const prepared = prepareCostX(ctx, side, step.source, ability.costs, purpose, targetsNeedX(ability.effect));
    const { x } = prepared;
    const [choices] = choosePlayTime(ctx, [{ ability: step.ability, effect: ability.effect }], side, step.source, (_, role) => purpose(role), x ?? undefined);
    if (choices === undefined) throw new Error("choosePlayTime returns one entry per ability");
    const plan = planCosts(ctx, side, step.source, ability.costs, x, purpose, choices.targets.flat(), undefined, { endsPlayTime: true, preparedPayments: prepared.payments, ...(x === null ? {} : { selectorX: x }) });
    const abandoned = plan.payments.find(({ cost }) => cost.cost === "abandon")?.cards[0];
    const position = abandoned === undefined ? null : slotOf(state, abandoned);
    const captured = position === null ? choices : { ...choices, abandonedPosition: { side, slot: { ...position } } };
    ctx.commitPoint();
    payCosts(ctx, side, step.source, plan);
    if (ability.oncePerTurn === true) {
      state.oncePerTurn.push(oncePerTurnKey(step.source, step.ability));
    }
    const self = sourceInstance(step.source);
    const lastKnownSourceSpark = self === null ? undefined : ctx.departedSourceSpark.get(self);
    state.stack.push({ ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }), kind: "ability", source: step.source, ability: step.ability, origin, controller: side, choices: captured, x: plan.x, optionalPaid: plan.optionalPaid });
    ctx.emit({ kind: "abilityActivated", side, source: step.source, ability: step.ability });
    state.priority = opponent(side);
  },
};
