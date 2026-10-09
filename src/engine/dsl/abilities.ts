/** Reading an ability's parts across its kinds. */
import type { Effect } from "../effects/registry";
import type { Ability } from "./types";

/**
 * The effect an ability resolves or applies: an event's, an activated or
 * triggered ability's, or a static ability's continuous primitive. Keywords,
 * additional costs, reclaim, and win conditions carry no effect.
 */
export function abilityEffect(ability: Ability): Effect | null {
  switch (ability.kind) {
    case "event":
    case "activated":
    case "triggered":
    case "static":
      return ability.effect;
    case "keyword":
    case "additionalCost":
    case "reclaim":
    case "winCondition":
      return null;
  }
}
