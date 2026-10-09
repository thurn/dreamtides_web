import { choosePlayTime, purposeOf } from "../../effects/interpreter";
import { abilityOrigin, activatedAbilityAt, canActivate, oncePerTurnKey, sourceController } from "../../rules/activation";
import type { PromptRole } from "../../prompts/types";
import { chooseX, payCosts, planCosts } from "../../rules/costs";
import type { AbilitySource } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Activates an ability of a card in play or an emblem: play-time choices
 * (X, then modes, then targets, then the costs' alternatives, optional
 * costs, and cards), then the commit point,
 * then the costs, then the ability goes on the stack and the opponent
 * receives priority (D13).
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
    const x = chooseX(ctx, side, ability.costs, purpose("chooseX"));
    const [choices] = choosePlayTime(ctx, [{ ability: step.ability, effect: ability.effect }], side, step.source, (_, role) => purpose(role));
    if (choices === undefined) throw new Error("choosePlayTime returns one entry per ability");
    const plan = planCosts(ctx, side, step.source, ability.costs, x, purpose, choices.targets.flat());
    ctx.commitPoint();
    payCosts(ctx, side, step.source, plan);
    if (ability.oncePerTurn === true) {
      state.oncePerTurn.push(oncePerTurnKey(step.source, step.ability));
    }
    state.stack.push({ kind: "ability", source: step.source, ability: step.ability, origin, controller: side, choices, x, optionalPaid: plan.optionalPaid });
    ctx.emit({ kind: "abilityActivated", side, source: step.source, ability: step.ability });
    state.priority = opponent(side);
  },
};
