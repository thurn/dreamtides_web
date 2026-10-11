import type { InstanceId, Side } from "../../state/ids";
import { identifies } from "../../view/knowledge";
import type { EventDefinition } from "../types";

/**
 * `missing` characters could not enter `side`'s full back rank (rules §
 * Battlefield Capacity): `instance` stayed where it was, or, when it is
 * `null`, figments or copies were not created or the viewer cannot identify
 * the character that stayed in a hidden zone.
 */
export interface CapacityReachedEvent {
  readonly kind: "capacityReached";
  readonly side: Side;
  readonly instance: InstanceId | null;
  readonly missing: number;
}

/** Both sides see the capacity result; only a side that knows the card sees its identity. */
export const capacityReached: EventDefinition<CapacityReachedEvent> = {
  kind: "capacityReached",
  privateTo: () => null,
  redact: (event, viewer, state) =>
    event.instance === null || identifies(state, event.instance, viewer) ? event : { ...event, instance: null },
};
