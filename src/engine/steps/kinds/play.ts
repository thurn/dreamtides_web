import { instanceCard, printedCardId } from "../../catalog";
import { eventAbilities } from "../../effects/abilities";
import { choosePlayTime, purposeOf } from "../../effects/interpreter";
import { costModifier } from "../../continuous/costs";
import { chooseX, payCosts, planCosts } from "../../rules/costs";
import { xCost } from "../../dsl/energy";
import { endFloating } from "../../rules/floating";
import { instanceOrigin } from "../../rules/activation";
import { canPlay, playRoutes, routeCosts, routePayable, type PlayRoute, type PlayZone } from "../../rules/timing";
import { recordPlayed } from "../../rules/turn-log";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { ChooseModePrompt, PromptRole } from "../../prompts/types";
import type { InstanceId, Slot } from "../../state/ids";
import type { EffectChoices } from "../../state/types";
import { opponent } from "../../state/ids";
import type { StepDefinition } from "../types";

/**
 * Plays a card from the hand of the side holding it, or from its owner's
 * void by Reclaim: play-time choices (Offering or the card's costs, when it
 * has Offering; X, then each event ability's modes, then its targets, then
 * the additional costs' alternatives, optional costs, and cards), then the
 * commit point, then the costs (the energy and X together after cost
 * modifications, then the additional costs in printed order) and the end of
 * the "next card" cost modifiers the play used, then the card moves to the
 * stack, reclaimed or offered as it was played, and the opponent receives
 * priority (D13). A character dropped on an open back-rank `slot` resolves
 * there if it is still open.
 */
export interface PlayStep {
  readonly kind: "play";
  readonly card: InstanceId;
  readonly from: PlayZone;
  readonly slot?: Slot;
}

export const play: StepDefinition<PlayStep> = {
  kind: "play",
  canceller: (state, step) => state.instances[step.card]?.controller ?? null,
  hasCommitPoint: true,
  run(ctx, step) {
    const { state, catalog } = ctx;
    const instance = instanceOf(state, step.card);
    // A card in hand is played by the side holding it, which may not be its owner.
    const side = instance.controller;
    if (!canPlay(state, catalog, side, step.card, step.from)) {
      throw new Error(`Card ${step.card} cannot be played now`);
    }
    const definition = instanceCard(catalog, instance);
    const cardId = printedCardId(instance.printing);
    const origin = instanceOrigin(instance);
    const modifier = costModifier(state, catalog, step.card, side);
    const purpose = (ability: number, role: PromptRole) => purposeOf(step.card, origin, ability, role);
    const routes = playRoutes(state, catalog, step.card, step.from);
    let route: PlayRoute = routes[0] ?? "hand";
    if (routes.length > 1) {
      const mode = ctx.choose<ChooseModePrompt>({
        kind: "chooseMode",
        side,
        purpose: purpose(0, "playRoute"),
        options: routes.map((option, index) => ({
          mode: index,
          legal: routePayable(state, catalog, side, step.card, option),
        })),
      });
      route = routes[mode] ?? route;
    }
    const costs = routeCosts(definition, instance.variant, route);
    let x: number | null;
    let choices: readonly EffectChoices[];
    if (definition.synthetic?.play !== undefined) {
      const chosen = definition.synthetic.play(ctx, step.card);
      x = chosen.x ?? null;
      choices = [{ modes: chosen.modes ?? [], targets: chosen.targets ?? [] }];
    } else {
      // Offering plays the card for 0●: if its cost includes X, X is 0.
      x = route === "offering" ? (xCost(definition.costs) === null ? null : 0) : chooseX(ctx, side, costs, purpose(0, "chooseX"), modifier);
      choices = choosePlayTime(ctx, eventAbilities(definition, instance.variant), side, step.card, purpose);
    }
    const targets = choices.flatMap((choice) => choice.targets.flat());
    const costAbility = Math.max(0, definition.abilities(instance.variant).findIndex((ability) => ability.kind === "additionalCost"));
    const plan = planCosts(ctx, side, step.card, costs, x, (role) => purpose(costAbility, role), [step.card, ...targets], modifier);
    ctx.commitPoint();
    payCosts(ctx, side, step.card, plan);
    endFloating(ctx, (effect) => modifier.consumes.includes(effect.id));
    moveToStack(ctx, step.card, side, { choices, x, optionalPaid: plan.optionalPaid, ...(step.slot === undefined ? {} : { slot: step.slot }) });
    if (route === "reclaim") instance.status.reclaimed = true;
    if (route === "offering") instance.status.offering = true;
    recordPlayed(state, catalog, side, step.card);
    ctx.emit({ kind: "cardPlayed", side, instance: step.card });
    if (definition.status === "pending" && cardId !== null) {
      ctx.emit({ kind: "pendingAbility", side, cardId, instance: step.card, reason: "played" });
    }
    state.priority = opponent(side);
  },
};
