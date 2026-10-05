import { chooseModes, chooseTargets, chosenModes, collectTargets, purposeOf } from "../../effects/interpreter";
import { abilityOrigin, activatedAbilityAt, canActivate, oncePerTurnKey, originCardId, sourceController } from "../../rules/activation";
import { chooseCostCards, chooseX, payCosts } from "../../rules/costs";
import type { AbilitySource } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Activates an ability of a card in play or an emblem: play-time choices
 * (X, then modes, then targets, then the cards that pay costs), then the commit point,
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
  run(ctx, step) {
    const { state, catalog } = ctx;
    const side = sourceController(state, step.source);
    const origin = abilityOrigin(state, step.source);
    const ability = activatedAbilityAt(state, catalog, step.source, step.ability);
    if (side === null || origin === null || ability === null || !canActivate(state, catalog, side, step.source, step.ability)) {
      throw new Error(`Ability ${String(step.ability)} cannot be activated now`);
    }
    const cardId = originCardId(origin);
    const purpose = (role: string) => purposeOf(step.source, cardId, step.ability, role);
    const x = chooseX(ctx, side, ability.costs, purpose("chooseX"));
    const modes = chooseModes(ctx, ability.effect, side, step.source, purpose("chooseOne"));
    const specs = collectTargets(ability.effect, chosenModes(ability.effect, modes));
    const targets = chooseTargets(ctx, specs, side, step.source, purpose("target"));
    const cards = chooseCostCards(ctx, side, step.source, ability.costs, purpose, targets.flat());
    ctx.commitPoint();
    payCosts(ctx, side, step.source, ability.costs, x, cards);
    if (ability.oncePerTurn === true) {
      state.oncePerTurn.push(oncePerTurnKey(step.source, step.ability));
    }
    state.stack.push({ kind: "ability", source: step.source, ability: step.ability, origin, controller: side, modes, targets, x });
    ctx.emit({ kind: "abilityActivated", side, source: step.source, ability: step.ability });
    state.priority = opponent(side);
  },
};
