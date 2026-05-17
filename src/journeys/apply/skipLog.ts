import { logEvent } from "../../logging";

export type DreamJourneySkipReason = "visual" | "battle_window" | "dreamwell";

export function logSkippedVisualTemplate(
  templateId: string,
  reason: DreamJourneySkipReason,
): void {
  logEvent("dream_journey_skipped_visual", {
    templateId,
    reason,
  });
}
