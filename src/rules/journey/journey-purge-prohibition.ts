import type { JourneyState } from "../../types/journey";
import type { JourneyModifierRegistry } from "./modifier-registry";

/** Evaluate the validated domain result's holdings before positive observers. */
export function preventsJourneyPurge(
  journey: Pick<JourneyState, "dreamsigns">,
  registry: Pick<JourneyModifierRegistry, "lookup">,
): boolean {
  return journey.dreamsigns.some(({ id }) => registry.lookup(id)?.journeyPurge?.kind === "preventPurge");
}
