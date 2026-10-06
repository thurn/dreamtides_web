import { eventAbilities } from "../../effects/abilities";
import { chooseModes, chooseTargets, chosenModes, collectTargets, purposeOf } from "../../effects/interpreter";
import { costModifier } from "../../continuous/costs";
import { chooseX, payCosts, planCosts, playCosts } from "../../rules/costs";
import { endFloating } from "../../rules/floating";
import { canPlayFromHand } from "../../rules/timing";
import { recordPlayed } from "../../rules/turn-log";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { InstanceId } from "../../state/ids";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Plays a card from the hand of the side holding it: play-time choices (X,
 * then each event ability's modes, then its targets, then the additional
 * costs' alternatives, optional costs, and cards), then the commit point,
 * then the costs (the energy and X together after cost modifications, then
 * the additional costs in printed order) and the end of the "next card"
 * cost modifiers the play used, then the card moves to the stack and the
 * opponent receives priority (D13).
 */
export interface PlayStep {
  readonly kind: "play";
  readonly card: InstanceId;
}

export const play: StepDefinition<PlayStep> = {
  kind: "play",
  canceller: (state, step) => state.instances[step.card]?.controller ?? null,
  run(ctx, step) {
    const { state, catalog } = ctx;
    const instance = instanceOf(state, step.card);
    // A card in hand is played by the side holding it, which may not be its owner.
    const side = instance.controller;
    if (!canPlayFromHand(state, catalog, side, step.card)) {
      throw new Error(`Card ${step.card} cannot be played now`);
    }
    const definition = catalog.card(instance.cardId);
    const costs = playCosts(definition, instance.variant);
    const modifier = costModifier(state, catalog, step.card, side);
    const purpose = (ability: number, role: string) => purposeOf(step.card, instance.cardId, ability, role);
    let x: number | null;
    let modes: readonly number[];
    let targets: readonly (readonly InstanceId[])[];
    if (definition.synthetic?.play !== undefined) {
      const choices = definition.synthetic.play(ctx, step.card);
      x = choices.x ?? null;
      modes = choices.modes ?? [];
      targets = choices.targets ?? [];
    } else {
      x = chooseX(ctx, side, costs, purpose(0, "chooseX"), modifier);
      const abilities = eventAbilities(definition, instance.variant);
      const abilityModes = abilities.map((ability) =>
        chooseModes(ctx, ability.effect, side, step.card, purpose(ability.ability, "chooseOne")),
      );
      targets = abilities.flatMap((ability, index) =>
        chooseTargets(
          ctx,
          collectTargets(ability.effect, chosenModes(ability.effect, abilityModes[index] ?? [])),
          side,
          step.card,
          purpose(ability.ability, "target"),
        ),
      );
      modes = abilityModes.flat();
    }
    const costAbility = Math.max(0, definition.abilities(instance.variant).findIndex((ability) => ability.kind === "additionalCost"));
    const plan = planCosts(ctx, side, step.card, costs, x, (role) => purpose(costAbility, role), [step.card, ...targets.flat()], modifier);
    ctx.commitPoint();
    payCosts(ctx, side, step.card, plan);
    endFloating(ctx, (effect) => modifier.consumes.includes(effect.id));
    moveToStack(ctx, step.card, side, { modes, targets, x, optionalPaid: plan.optionalPaid });
    recordPlayed(state, catalog, side, step.card);
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    if (definition.status === "pending") {
      ctx.emit({ kind: "pendingAbility", side, cardId: instance.cardId, instance: step.card, reason: "played" });
    }
    state.priority = opponent(side);
  },
};
