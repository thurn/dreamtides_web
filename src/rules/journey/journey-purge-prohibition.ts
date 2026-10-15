import type { JourneyPurgePreventionSource, JourneyState } from "../../types/journey";
import type { JourneyModifierRegistry } from "./modifier-registry";

/** Attribute a redundant prohibition to its first registered physical held source. */
export function journeyPurgePreventionSource(
  journey: Pick<JourneyState, "dreamsigns">,
  registry: Pick<JourneyModifierRegistry, "lookup">,
): JourneyPurgePreventionSource | null {
  const heldIndex = journey.dreamsigns.findIndex(({ id }) => registry.lookup(id)?.journeyPurge?.kind === "preventPurge");
  return heldIndex < 0 ? null : { dreamsignId: journey.dreamsigns[heldIndex].id, heldIndex };
}

/** Evaluate the validated domain result's holdings before positive observers. */
export function preventsJourneyPurge(
  journey: Pick<JourneyState, "dreamsigns">,
  registry: Pick<JourneyModifierRegistry, "lookup">,
): boolean {
  return journeyPurgePreventionSource(journey, registry) !== null;
}
