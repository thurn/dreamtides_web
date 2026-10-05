/** Builders for abilities, targets, selectors, and values. Primitive builders live in their modules. */
import type { CardSubtype } from "../../types/card-identity";
import type { Effect } from "../effects/registry";
import type {
  Ability,
  AllSpec,
  CharacterSelector,
  Keyword,
  SelfSpec,
  TargetSpec,
  ValueExpr,
} from "./types";

export function event(effect: Effect): Ability {
  return { kind: "event", effect };
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
