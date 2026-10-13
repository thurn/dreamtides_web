import type { InstanceId, Side } from "../../state/ids";
import { publicEvent, type RemovalProvenance } from "../types";

export interface DissolvedEvent {
  readonly kind: "dissolved";
  readonly instance: InstanceId;
  readonly side: Side;
  readonly removal?: RemovalProvenance;
}

export const dissolved = publicEvent<DissolvedEvent>("dissolved");
