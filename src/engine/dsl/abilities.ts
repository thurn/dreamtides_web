/** Reading an ability's parts and the zones where it works. */
import type { Effect } from "../effects/registry";
import type { Zone } from "../state/ids";
import type { Ability, FunctionalZone } from "./types";

/** Where a card's static or triggered ability works; `any` excludes the stack and Banished zone. */
export function worksInZone(zone: FunctionalZone, current: Zone): boolean {
  return zone === "any"
    ? current === "play" || current === "void" || current === "hand" || current === "deck"
    : current === zone;
}

/**
 * The effect an ability resolves or applies: an event's, an activated or
 * triggered ability's, or a static ability's continuous primitive. Keywords,
 * additional costs, reclaim, win conditions, and event-copy modifiers carry no effect.
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
    case "eventCopyModifier":
      return null;
  }
}
