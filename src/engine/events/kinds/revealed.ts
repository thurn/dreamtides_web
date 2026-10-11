import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/**
 * Cards in `side`'s hand were revealed to both players, by a reveal cost
 * `side` paid or an effect revealing that hand; they stay in hand.
 */
export interface RevealedEvent {
  readonly kind: "revealed";
  readonly side: Side;
  readonly instances: readonly InstanceId[];
}

export const revealed = publicEvent<RevealedEvent>("revealed");
