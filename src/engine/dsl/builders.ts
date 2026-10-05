/** Builders for abilities, targets, selectors, and values. Primitive builders live in their modules. */
import type { CardSubtype } from "../../types/card-identity";
import type { Effect } from "../effects/registry";
import type {
  Ability,
  ActivatedAbility,
  AllSpec,
  CharacterSelector,
  Cost,
  Keyword,
  SelfSpec,
  Speed,
  StackItemSelector,
  TargetSpec,
  ValueExpr,
} from "./types";

export function event(effect: Effect): Ability {
  return { kind: "event", effect };
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
export function energy(amount: number): Cost {
  return { cost: "energy", amount };
}

/** "X●". */
export function energyX(): Cost {
  return { cost: "energyX" };
}

/** "☾". */
export function exhaustSelf(): Cost {
  return { cost: "exhaustSelf" };
}

/** "Abandon a character" (or N characters) matching the selector; always your own. */
export function abandonCost(extra: Omit<CharacterSelector, "controller"> = {}, count = 1): Cost {
  return { cost: "abandon", selector: { controller: "you", ...extra }, count };
}

/** "Discard N cards" as a cost. */
export function discardCost(count = 1): Cost {
  return { cost: "discard", count };
}

/** Cards on the stack: by controller relative to the effect's controller, and card type. */
export function stackItem(
  extra: Partial<Pick<StackItemSelector, "controller" | "cardType">> = {},
): StackItemSelector {
  return { kind: "stackItem", controller: extra.controller ?? "any", ...(extra.cardType === undefined ? {} : { cardType: extra.cardType }) };
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
