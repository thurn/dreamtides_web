import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface ErodedEvent {
  readonly kind: "eroded";
  readonly side: Side;
  readonly instance: InstanceId;
}

export const eroded = publicEvent<ErodedEvent>("eroded");
