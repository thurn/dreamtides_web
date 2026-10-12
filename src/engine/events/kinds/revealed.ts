import type { InstanceId, Side } from "../../state/ids";
import { publicEvent } from "../types";

/**
 * Announces listed cards from `side`'s hand, or its current deck top, to
 * both players. The hand list
 * can contain a subset of the hand, including a chosen card, or the whole
 * hand. `side` holds that hand; the cards stay in hand.
 */
export interface RevealedEvent {
  readonly kind: "revealed";
  readonly side: Side;
  /** Omitted for a hand reveal; deck reveals name only its current top. */
  readonly zone?: "hand" | "deck";
  readonly instances: readonly InstanceId[];
}

export const revealed = publicEvent<RevealedEvent>("revealed");
