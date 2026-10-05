import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface DissolvedEvent {
  readonly kind: "dissolved";
  readonly instance: InstanceId;
  readonly side: Side;
}

export const dissolved = publicEvent<DissolvedEvent>("dissolved");
