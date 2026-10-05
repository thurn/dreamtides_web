import type { InstanceId, Side, Zone } from "../../state/ids";
import { publicEvent } from "../types";

/** A card is leaving play for `to` (`null` when it ceases to exist); emitted while it is still in play. */
export interface LeftPlayEvent {
  readonly kind: "leftPlay";
  readonly instance: InstanceId;
  /** Its controller in play. */
  readonly side: Side;
  readonly to: Zone | null;
}

export const leftPlay = publicEvent<LeftPlayEvent>("leftPlay");
