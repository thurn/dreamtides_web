import type { InstanceId, Side, Slot } from "../../state/ids";
import { publicEvent } from "../types";

export interface RepositionedEvent {
  readonly kind: "repositioned";
  readonly instance: InstanceId;
  readonly side: Side;
  readonly from: Slot;
  readonly to: Slot;
  /** The character that moved the other way, when the move was a swap. */
  readonly swappedWith: InstanceId | null;
}

export const repositioned = publicEvent<RepositionedEvent>("repositioned");
