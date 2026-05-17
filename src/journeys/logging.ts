import { logEvent } from "../logging";

export function logJourneyChooserCancelled(fields: {
  readonly siteId: string;
  readonly journeyId: string;
  readonly requestId: string;
}): void {
  logEvent("dream_journey_chooser_cancelled", fields);
}
