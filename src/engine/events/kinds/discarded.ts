import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface DiscardedEvent {
  readonly kind: "discarded";
  readonly side: Side;
  readonly instance: InstanceId;
}

export const discarded = publicEvent<DiscardedEvent>("discarded");
