import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

export interface BlockersDesignatedEvent {
  readonly kind: "blockersDesignated";
  readonly side: Side;
  /** Challenger → blocker. */
  readonly blockers: Readonly<Record<InstanceId, InstanceId>>;
}

export const blockersDesignated = publicEvent<BlockersDesignatedEvent>(
  "blockersDesignated",
);
