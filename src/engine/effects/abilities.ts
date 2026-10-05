import type { EngineCardDefinition } from "../catalog";
import type { Ability, PlayTimeTarget, Variant } from "../dsl/types";
import type { Effect } from "./registry";
import { collectTargets } from "./interpreter";

/** An event ability with its index in the card's ability list and its play-time targets. */
export interface EventAbility {
  readonly ability: number;
  readonly effect: Effect;
  readonly targets: readonly PlayTimeTarget[];
}

/** A card's event abilities for a variant, in printed order. */
export function eventAbilities(definition: EngineCardDefinition, variant: Variant): EventAbility[] {
  return definition.abilities(variant).flatMap((ability: Ability, index) =>
    ability.kind === "event"
      ? [{ ability: index, effect: ability.effect, targets: collectTargets(ability.effect) }]
      : [],
  );
}

/** The play-time target specs of each event ability, in printed order. */
export function eventTargetSpecs(definition: EngineCardDefinition, variant: Variant): PlayTimeTarget[][] {
  return eventAbilities(definition, variant).map((ability) => [...ability.targets]);
}
