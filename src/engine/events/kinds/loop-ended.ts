import type { LoopEndReason, LoopId } from "../../loops/types";
import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** A loop repetition ended after `iterations` complete iterations, for `reason`. */
export interface LoopEndedEvent {
  readonly kind: "loopEnded";
  readonly side: Side;
  readonly loop: LoopId;
  readonly iterations: number;
  readonly reason: LoopEndReason;
}

export const loopEnded = publicEvent<LoopEndedEvent>("loopEnded");
