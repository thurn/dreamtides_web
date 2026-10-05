import type { EngineCardDefinition } from "../catalog";
import type { Ability, TargetSpec, Variant } from "../dsl/types";
import type { Effect } from "./registry";
import { collectTargets } from "./interpreter";

/** A card's event abilities for a variant, in printed order. */
export function eventEffects(definition: EngineCardDefinition, variant: Variant): Effect[] {
  return definition
    .abilities(variant)
    .flatMap((ability: Ability) => (ability.kind === "event" ? [ability.effect] : []));
}

/** The play-time target specs of each event effect, aligned with eventEffects. */
export function eventTargetSpecs(definition: EngineCardDefinition, variant: Variant): TargetSpec[][] {
  return eventEffects(definition, variant).map(collectTargets);
}
