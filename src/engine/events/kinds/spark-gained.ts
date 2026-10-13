import type { InstanceId, Side } from "../../state/ids";
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
}

/** Observation is fixed at emission, including when later movement hides or reveals the card. */
export const sparkGained: EventDefinition<SparkGainedEvent> = {
  kind: "sparkGained",
  privateTo: () => null,
  redact: (event, viewer) => event.seenBy === undefined || event.seenBy.includes(viewer) ? event : null,
};
