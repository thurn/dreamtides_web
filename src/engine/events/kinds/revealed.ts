import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/**
 * Announces the listed cards from `side`'s hand to both players. The list
 * can contain a subset of the hand, including a chosen card, or the whole
 * hand. `side` holds that hand; the cards stay in hand.
 */
export interface RevealedEvent {
  readonly kind: "revealed";
  readonly side: Side;
  readonly instances: readonly InstanceId[];
}

export const revealed = publicEvent<RevealedEvent>("revealed");
