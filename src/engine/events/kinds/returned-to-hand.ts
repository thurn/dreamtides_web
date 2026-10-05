import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface ReturnedToHandEvent {
  readonly kind: "returnedToHand";
  readonly instance: InstanceId;
  /** The owner, whose hand the card returns to. */
  readonly side: Side;
}

export const returnedToHand = publicEvent<ReturnedToHandEvent>("returnedToHand");
