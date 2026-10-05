import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface ChallengersDesignatedEvent {
  readonly kind: "challengersDesignated";
  readonly side: Side;
  readonly challengers: readonly InstanceId[];
}

export const challengersDesignated = publicEvent<ChallengersDesignatedEvent>(
  "challengersDesignated",
);
