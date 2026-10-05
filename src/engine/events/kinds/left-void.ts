import type { InstanceId, Side, Zone } from "../../state/ids";
import { publicEvent } from "../types";

/** A card is leaving its owner's void for `to` (`null` when it ceases to exist); emitted while it is still there. */
export interface LeftVoidEvent {
  readonly kind: "leftVoid";
  readonly instance: InstanceId;
  /** The void's owner. */
  readonly side: Side;
  readonly to: Zone | null;
}

export const leftVoid = publicEvent<LeftVoidEvent>("leftVoid");
