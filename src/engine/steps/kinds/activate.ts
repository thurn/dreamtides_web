import { choosePlayTime, purposeOf, targetsNeedOptionalCost } from "../../effects/interpreter";
import { abilityOrigin, activatedAbilityAt, canActivate, oncePerTurnKey, sourceController } from "../../rules/activation";
import type { PromptRole } from "../../prompts/types";
import { prepareCostX, payCosts, planCosts, type CostPlan } from "../../rules/costs";
import { slotOf } from "../../rules/zones";
import type { AbilitySource } from "../../state/ids";
import { opponent, sourceInstance } from "../../state/ids";
import type { StepDefinition } from "../types";
import { targetsNeedX } from "../immediate-x";
import { readsStoredCounters } from "../../dsl/values";

/**
 * Activates an ability of a card in play, in its holder's hand with its
 * required exact-source reveal cost, in its owner's void when its ability
 * works there, or of an emblem: play-time choices
 * (X and any mandatory card-cost capture needed by targeting, then modes,
 * then targets, then the costs' alternatives, optional
 * costs, and cards; payment-dependent targets prepare these decisions before modes and targets), then the commit point,
 * then the costs, then the ability goes on the stack and the opponent
 * receives priority (D13). The stack item keeps the source's ability
 * origin as activated, so it resolves as activated even after its card has
 * left its activation zone.
 */
export interface ActivateStep {
  readonly kind: "activate";
  readonly source: AbilitySource;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
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
    const paymentDependent = targetsNeedOptionalCost(ability.effect);
    let plan: CostPlan | null = paymentDependent
      ? planCosts(ctx, side, step.source, ability.costs, x, purpose, [], undefined,
        { preparedPayments: prepared.payments, ...(x === null ? {} : { selectorX: x }) }) : null;
    const [choices] = choosePlayTime(ctx, [{ ability: step.ability, effect: ability.effect }], side, step.source, (_, role) => purpose(role),
      paymentDependent ? (plan?.x ?? undefined) : (x ?? undefined), plan === null ? {} :
        { optionalPaid: plan.optionalPaid, excluded: plan.payments.flatMap(payment => payment.cards) });
    if (choices === undefined) throw new Error("choosePlayTime returns one entry per ability");
    plan ??= planCosts(ctx, side, step.source, ability.costs, x, purpose, choices.targets.flat(), undefined,
      { endsPlayTime: true, preparedPayments: prepared.payments, ...(x === null ? {} : { selectorX: x }) });
    const abandoned = plan.payments.find(({ cost }) => cost.cost === "abandon")?.cards[0];
    const position = abandoned === undefined ? null : slotOf(state, abandoned);
    const captured = position === null ? choices : { ...choices, abandonedPosition: { side, slot: { ...position } } };
    ctx.commitPoint();
    const paymentSourceCounters = payCosts(ctx, side, step.source, plan, readsStoredCounters(ability.effect) ? { retainSourceCounters: true } : {});
    if (ability.oncePerTurn === true) {
      state.oncePerTurn.push(oncePerTurnKey(step.source, step.ability));
    }
    const self = sourceInstance(step.source);
    const lastKnownSourceSpark = self === null ? undefined : ctx.departedSourceSpark.get(self);
    state.stack.push({ ...(paymentSourceCounters === null ? {} : { paymentSourceCounters }), ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }), kind: "ability", source: step.source, ability: step.ability, origin, controller: side, choices: captured, x: plan.x, optionalPaid: plan.optionalPaid });
    ctx.emit({ kind: "abilityActivated", side, source: step.source, ability: step.ability });
    state.priority = opponent(side);
  },
};
