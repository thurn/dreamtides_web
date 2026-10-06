import type { InstanceId, Side, Slot } from "../../state/ids";
import { publicEvent } from "../types";

/** `to` gained control of a character, which moved to `slot` in its back rank. */
export interface ControlChangedEvent {
  readonly kind: "controlChanged";
  readonly instance: InstanceId;
  readonly from: Side;
  readonly to: Side;
  readonly slot: Slot;
}

export const controlChanged = publicEvent<ControlChangedEvent>("controlChanged");
