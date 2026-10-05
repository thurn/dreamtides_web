import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/** `side` revealed cards from its hand to both players, as when paying a reveal cost; they stay in hand. */
export interface RevealedEvent {
  readonly kind: "revealed";
  readonly side: Side;
  readonly instances: readonly InstanceId[];
}

export const revealed = publicEvent<RevealedEvent>("revealed");
