import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A side abandoned one of its characters, moving it from play to its owner's void. */
export interface AbandonedEvent {
  readonly kind: "abandoned";
  readonly instance: InstanceId;
  readonly side: Side;
}

export const abandoned = publicEvent<AbandonedEvent>("abandoned");
