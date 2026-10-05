import type { EngineCardDefinition } from "../catalog";
import type { Ability, PlayTimeTarget, Variant } from "../dsl/types";
import type { Effect } from "./registry";
import { everyTarget } from "./interpreter";

/** An event ability with its index in the card's ability list. */
export interface EventAbility {
  readonly ability: number;
  readonly effect: Effect;
}

/** A card's event abilities for a variant, in printed order. */
export function eventAbilities(definition: EngineCardDefinition, variant: Variant): EventAbility[] {
  return definition.abilities(variant).flatMap((ability: Ability, index) =>
    ability.kind === "event" ? [{ ability: index, effect: ability.effect }] : [],
  );
}

/** Every target spec of each event ability, in any of its modes, in printed order. */
export function eventTargetSpecs(definition: EngineCardDefinition, variant: Variant): PlayTimeTarget[][] {
  return eventAbilities(definition, variant).map((ability) => everyTarget(ability.effect));
}
