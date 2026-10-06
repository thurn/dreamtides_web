import type { LoopId } from "../../loops/types";
import type { Side } from "../../state/ids";
import { publicEvent } from "../types";

/** `side` accepted the loop on offer, to repeat it `count` more times or until the battle ends. */
export interface LoopStartedEvent {
  readonly kind: "loopStarted";
  readonly side: Side;
  readonly loop: LoopId;
  readonly count: number | "untilVictory";
}

export const loopStarted = publicEvent<LoopStartedEvent>("loopStarted");
