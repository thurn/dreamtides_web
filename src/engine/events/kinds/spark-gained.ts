import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { Expiry } from "../../state/types";
import type { EventDefinition } from "../types";

/**
 * A character gained N✦ (rules § Spark): permanently (`expiry` never) or
 * until `expiry`. `additional` marks the gain an additional-spark ability
 * made ("it gains 1 additional ✦"), which triggers no "when … gains ✦"
 * ability (rules § Spark → Additional spark).
 */
export interface SparkGainedEvent {
  readonly kind: "sparkGained";
  readonly instance: InstanceId;
  readonly amount: number;
  readonly expiry: Expiry;
  readonly additional: boolean;
  /** Sides identifying a hidden subject at emission; absent for a public gain. */
  readonly seenBy?: readonly Side[];
  /** One entry-only contribution; null when the viewer did not observe its causal source at entry. */
  readonly entrySpark?: {
    readonly source: AbilitySource;
    readonly ability: number;
    readonly controller: Side;
    readonly observedBy: readonly Side[];
  } | null;
}

/** Observation is fixed at emission, including when later movement hides or reveals the card. */
export const sparkGained: EventDefinition<SparkGainedEvent> = {
  kind: "sparkGained",
  privateTo: () => null,
  redact: (event, viewer) => {
    if (event.seenBy !== undefined && !event.seenBy.includes(viewer)) return null;
    return event.entrySpark != null && !event.entrySpark.observedBy.includes(viewer)
      ? { ...event, entrySpark: null } : event;
  },
};
