/** Reading an ability's parts and the zones where it works. */
import type { Effect } from "../effects/registry";
import type { Zone } from "../state/ids";
import type { Ability, FunctionalZone, NamedTrigger, Trigger } from "./types";

const NAMED_TRIGGERS = { materialized: true, dawn: true, dusk: true, night: true, challenge: true, dissolved: true } satisfies Record<NamedTrigger, true>;

/** Whether persisted or DSL input names a formal trigger. */
export function isNamedTrigger(value: unknown): value is NamedTrigger {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NAMED_TRIGGERS, value);
}

/** The distinct named triggers an ability list has, including combined triggers. */
export function namedTriggersOf(abilities: readonly Ability[]): readonly NamedTrigger[] {
  const names = new Set<NamedTrigger>();
  const add = (trigger: Trigger): void => {
    if (trigger.on === "either") trigger.triggers.forEach(add);
    else if (isNamedTrigger(trigger.on)) names.add(trigger.on);
  };
  abilities.forEach((ability) => { if (ability.kind === "triggered") add(ability.trigger); });
  return [...names];
}

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
