/** Builders for abilities, targets, selectors, and values. Primitive builders live in their modules. */
import type { CardSubtype } from "../../types/card-identity";
import type { Effect } from "../effects/registry";
import type {
  Ability,
  ActivatedAbility,
  AdditionalCost,
  AdditionalCostAbility,
  AllSpec,
  CardFilter,
  CharacterSelector,
  ChoiceCost,
  Condition,
  Cost,
  EnergyCost,
  EnergyXCost,
  Keyword,
  OptionalCost,
  PaymentCost,
  ReclaimAbility,
  SelfSpec,
  Speed,
  StackItemSelector,
  StaticAbility,
  SupportedSpec,
  TargetSpec,
  ValueExpr,
} from "./types";

export function event(effect: Effect): Ability {
  return { kind: "event", effect };
}

/** An always-on ability holding a continuous primitive: "Warriors you control have +1✦." */
export function staticAbility(effect: Effect): StaticAbility {
  return { kind: "static", effect };
}

/** "Cost: Effect". Standard speed unless stated. */
export function activated(
  costs: readonly Cost[],
  effect: Effect,
  options: { readonly speed?: Speed; readonly oncePerTurn?: boolean } = {},
): ActivatedAbility {
  return {
    kind: "activated",
    costs,
    effect,
    speed: options.speed ?? "standard",
    ...(options.oncePerTurn === true ? { oncePerTurn: true } : {}),
  };
}

/** "N●". */
export function energy(amount: number): EnergyCost {
  return { cost: "energy", amount };
}

/** "X●"; X is at least 1 unless `min` widens it to 0 (rules § Costs, Requirements, and X). */
export function energyX(min = 1): EnergyXCost {
  return { cost: "energyX", min };
}

/** "☾". */
export function exhaustSelf(): PaymentCost {
  return { cost: "exhaustSelf" };
}

/** "Abandon a character" (or N characters) matching the selector; always your own. */
export function abandonCost(extra: Omit<CharacterSelector, "controller"> = {}, count = 1): PaymentCost {
  return { cost: "abandon", selector: { controller: "you", ...extra }, count };
}

/** "Discard N cards" as a cost. */
export function discardCost(count = 1): PaymentCost {
  return { cost: "discard", count };
}

/** "N⧗": spend counters stored on the source. */
export function countersCost(amount: number): PaymentCost {
  return { cost: "counters", amount };
}

/** "Banish N cards from your void" (matching the filter) as a cost. */
export function banishFromVoidCost(count = 1, filter: CardFilter = {}): PaymentCost {
  return { cost: "banishFromVoid", count, filter };
}

/** "Reveal N cards from your hand" (matching the filter) as a cost. */
export function revealCost(count = 1, filter: CardFilter = {}): PaymentCost {
  return { cost: "reveal", count, filter };
}

/** "A or B": each option is the list of costs paid when it is chosen. */
export function choiceCost(...options: readonly (readonly PaymentCost[])[]): ChoiceCost {
  return { cost: "choice", options };
}

/** "You may A": the costs are paid only if the player chooses to. */
export function optionalCost(...costs: readonly PaymentCost[]): OptionalCost {
  return { cost: "optional", costs };
}

/** "To play this card, …": costs added to the card's printed energy cost. */
export function additionalCost(...costs: readonly AdditionalCost[]): AdditionalCostAbility {
  return { kind: "additionalCost", costs };
}

/** "If the additional cost was paid": the item's optional cost at `optional` (printed order) was paid. */
export function costPaid(optional = 0): Condition {
  return { cond: "costPaid", optional };
}

/** Cards on the stack: by controller relative to the effect's controller, and card type. */
export function stackItem(
  extra: Partial<Pick<StackItemSelector, "controller" | "cardType">> = {},
): StackItemSelector {
  return { kind: "stackItem", controller: extra.controller ?? "any", ...(extra.cardType === undefined ? {} : { cardType: extra.cardType }) };
}

/** "Reclaim N●" or "Reclaim – costs": played from your void for `costs` in place of its printed energy cost. Plain Reclaim is `keyword("reclaim")`. */
export function reclaim(...costs: readonly Cost[]): ReclaimAbility {
  return { kind: "reclaim", costs };
}

export function keyword(name: Keyword): Ability {
  return { kind: "keyword", keyword: name };
}

export function target(selector: CharacterSelector, count = 1): TargetSpec {
  return { kind: "target", selector, count };
}

export function upTo(selector: CharacterSelector, count: number): TargetSpec {
  return { kind: "target", selector, count, upTo: true };
}

export function all(selector: CharacterSelector): AllSpec {
  return { kind: "all", selector };
}

export function self(): SelfSpec {
  return { kind: "self" };
}

export function enemyCharacter(extra: Omit<CharacterSelector, "controller"> = {}): CharacterSelector {
  return { controller: "opponent", ...extra };
}

export function characterYouControl(extra: Omit<CharacterSelector, "controller"> = {}): CharacterSelector {
  return { controller: "you", ...extra };
}

export function anyCharacter(extra: Omit<CharacterSelector, "controller"> = {}): CharacterSelector {
  return { controller: "any", ...extra };
}

export function ofSubtype(subtype: CardSubtype): Pick<CharacterSelector, "subtype"> {
  return { subtype };
}

export function x(): ValueExpr {
  return { value: "x" };
}

export function count(of: CharacterSelector): ValueExpr {
  return { value: "count", of };
}

/** "Supported characters" (matching `extra`): the front-rank characters the source supports from the back rank. */
export function supported(extra: Omit<CharacterSelector, "controller"> = {}): SupportedSpec {
  return { kind: "supported", selector: extra };
}

/** "The number of characters supporting it" (C9). */
export function supporting(): ValueExpr {
  return { value: "supporting" };
}

/** `of` multiplied by `factor`: "+2✦ for each …". */
export function times(of: ValueExpr, factor: number): ValueExpr {
  return { value: "times", of, factor };
}

/** "X, where X is …", fixed as the effect resolves (RD-hv-7x4l.7-1). */
export function lockedAtResolution(of: ValueExpr): ValueExpr {
  return { value: "locked", of };
}
