import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface ReturnedToHandEvent {
  readonly kind: "returnedToHand";
  readonly instance: InstanceId;
  /** The player whose hand receives the returned card. */
  readonly side: Side;
}

export const returnedToHand = publicEvent<ReturnedToHandEvent>("returnedToHand");
