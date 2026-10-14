import { instanceCard, printedCardId } from "../../catalog";
import { eventAbilities } from "../../effects/abilities";
import { choosePlayTime, purposeOf, targetsNeedOptionalCost } from "../../effects/interpreter";
import { playPermission } from "../../continuous/permissions";
import { prepareCostX, payCosts, planCosts, type CostPlan, type PlannedCost } from "../../rules/costs";
import { xCost } from "../../dsl/energy";
import { endFloating } from "../../rules/floating";
import { instanceOrigin } from "../../rules/activation";
import { canPlay, playRoutes, routeCosts, routeCostModifier, routePayable, type PlayRoute, type PlayZone } from "../../rules/timing";
import { recordPlayed } from "../../rules/turn-log";
import { instanceOf, moveToStack } from "../../rules/zones";
import type { CostModifier } from "../../continuous/costs";
import type { ChooseModePrompt, PromptRole } from "../../prompts/types";
import type { InstanceId, Slot } from "../../state/ids";
import type { EffectChoices } from "../../state/types";
import { opponent } from "../../state/ids";
import type { StepContext, StepDefinition } from "../types";
import { targetsNeedX } from "../immediate-x";

/**
 * Plays a card from the hand of the side holding it, or from its owner's
 * void by a play permission or Reclaim: play-time choices (Offering or the
 * card's costs, when it has Offering; an applicable event alternative; a permission or Reclaim, when both
 * cover a void card; X and mandatory captures needed by immediate choices, then each event ability's modes, then its targets,
 * then the additional costs' alternatives, optional costs, and cards; a payment-dependent target prepares these decisions before modes and targets), then
 * the commit point, then the costs (the energy and X together after cost
 * modifications, then the additional costs in printed order) and the end of
 * the "next card" cost modifiers and play permission the play used, then the
 * card moves to the stack, reclaimed or offered as it was played, and the opponent receives
 * priority (D13). A character dropped on an open back-rank `slot` resolves
 * there if it is still open.
 */
export interface PlayStep {
  readonly kind: "play";
  readonly card: InstanceId;
  readonly from: PlayZone;
  readonly slot?: Slot;
}

/** A prepared play, before payment or stack movement. */
export interface PreparedPlay {
  readonly route: PlayRoute;
  readonly plan: CostPlan;
  readonly choices: readonly EffectChoices[];
  readonly modifier: CostModifier;
}

/** Shared ordinary play-time route, X, mode, target and additional-cost planning. */
export function planCardPlay(ctx: StepContext, card: InstanceId, routes: readonly PlayRoute[], from: PlayZone): PreparedPlay {
  const { state, catalog } = ctx;
  const instance = instanceOf(state, card);
  const side = instance.controller;
  const definition = instanceCard(catalog, instance);
  const origin = instanceOrigin(instance);
  const purpose = (ability: number, role: PromptRole) => purposeOf(card, origin, ability, role);
  let route: PlayRoute = routes[0] ?? "hand";
  if (routes.length > 1) {
    const mode = ctx.choose<ChooseModePrompt>({
      kind: "chooseMode",
      side,
      purpose: purpose(0, from === "void" ? "voidRoute" : "playRoute"),
      options: routes.map((option, index) => ({
        mode: index,
        ...(routes.includes("eventAlternative") ? { route: option === "hand" || option === "permission" ? "normal" as const : option } : {}),
        legal: routePayable(state, catalog, side, card, option),
      })),
    });
    route = routes[mode] ?? route;
  }
  const costs = routeCosts(state, catalog, card, route);
  const modifier = routeCostModifier(state, catalog, side, card, route);
  const costAbility = Math.max(0, definition.abilities(instance.variant).findIndex((ability) => ability.kind === "additionalCost"));
  let preparedPayments: readonly PlannedCost[] = [];
  let x: number | null;
  let choices: readonly EffectChoices[];
  if (definition.synthetic?.play !== undefined) {
    const chosen = definition.synthetic.play(ctx, card);
    x = chosen.x ?? null;
    choices = [{ modes: chosen.modes ?? [], targets: chosen.targets ?? [] }];
  } else {
    // Offering and event alternatives fix printed energy-X at zero; a separate count-only X is prepared normally.
    const abilities = eventAbilities(definition, instance.variant);
    const prepared = prepareCostX(ctx, side, card, costs, (role) => purpose(role === "chooseX" ? 0 : costAbility, role),
      abilities.some(({ effect }) => targetsNeedX(effect)), { modifier, excluded: [card],
        ...((route === "offering" || route === "eventAlternative") && xCost(definition.costs) !== null ? { fixedX: 0 } : {}) });
    x = prepared.x;
    preparedPayments = prepared.payments;
    if (abilities.some(({ effect }) => targetsNeedOptionalCost(effect))) {
      // Payment choices bind the restriction; every debit and move still follows target selection and commitment.
      const plan = planCosts(ctx, side, card, costs, x, (role) => purpose(costAbility, role), [card], modifier,
        { selectorX: x ?? 0, preparedPayments });
      choices = choosePlayTime(ctx, abilities, side, card, purpose, plan.x ?? 0,
        { optionalPaid: plan.optionalPaid, excluded: plan.payments.flatMap(payment => payment.cards) });
      return { route, plan, choices, modifier };
    }
    choices = choosePlayTime(ctx, abilities, side, card, purpose, x ?? 0);
  }
  const targets = choices.flatMap((choice) => choice.targets.flat());
  const plan = planCosts(ctx, side, card, costs, x, (role) => purpose(costAbility, role), [card, ...targets], modifier, { endsPlayTime: true, selectorX: x ?? 0, preparedPayments });
  return { route, plan, choices, modifier };
}

/** Pays a prepared play and publishes its ordinary played-card transition. */
export function commitCardPlay(ctx: StepContext, card: InstanceId, prepared: PreparedPlay, options: {
  readonly slot?: Slot;
  readonly permission?: ReturnType<typeof playPermission>;
} = {}): void {
  const { state, catalog } = ctx;
  const instance = instanceOf(state, card);
  const side = instance.controller;
  const definition = instanceCard(catalog, instance);
  const cardId = printedCardId(instance.printing);
  const { route, plan, modifier } = prepared;
  payCosts(ctx, side, card, plan);
  endFloating(ctx, (effect) => modifier.consumes.includes(effect.id) || effect.id === options.permission?.consumes);
  if (options.permission?.oncePerTurn !== undefined) state.oncePerTurn.push(options.permission.oncePerTurn);
  moveToStack(ctx, card, side, { choices: prepared.choices, x: plan.x, optionalPaid: plan.optionalPaid, ...(options.slot === undefined ? {} : { slot: options.slot }) });
  if (route === "reclaim") instance.status.reclaimed = true;
  instance.status.playedViaReclaim = route === "reclaim";
  if (route === "offering") instance.status.offering = true;
  recordPlayed(state, catalog, side, card);
  ctx.emit({ kind: "cardPlayed", side, instance: card });
  if (definition.status === "pending" && cardId !== null) {
    ctx.emit({ kind: "pendingAbility", side, cardId, instance: card, reason: "played" });
  }
  state.priority = opponent(side);
}

export const play: StepDefinition<PlayStep> = {
  kind: "play",
  canceller: (state, step) => state.instances[step.card]?.controller ?? null,
  hasCommitPoint: true,
  run(ctx, step) {
    const { state, catalog } = ctx;
    const side = instanceOf(state, step.card).controller;
    if (!canPlay(state, catalog, side, step.card, step.from)) throw new Error(`Card ${step.card} cannot be played now`);
    const prepared = planCardPlay(ctx, step.card, playRoutes(state, catalog, step.card, step.from), step.from);
    const permission = (prepared.route === "permission" || prepared.route === "eventAlternative" && step.from !== "hand") ? playPermission(state, catalog, step.card, side) : null;
    ctx.commitPoint();
    commitCardPlay(ctx, step.card, prepared, { permission, ...(step.slot === undefined ? {} : { slot: step.slot }) });
  },
};
