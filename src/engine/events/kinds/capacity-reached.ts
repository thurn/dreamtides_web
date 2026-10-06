import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/**
 * `missing` characters could not enter `side`'s full back rank (rules §
 * Battlefield Capacity): `instance` stayed where it was, or, when it is
 * `null`, figments or copies were not created.
 */
export interface CapacityReachedEvent {
  readonly kind: "capacityReached";
  readonly side: Side;
  readonly instance: InstanceId | null;
  readonly missing: number;
}

export const capacityReached = publicEvent<CapacityReachedEvent>("capacityReached");
