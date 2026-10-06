import type { AbilitySource, EffectId, InstanceId, Side } from "../../state/ids";
import type { EventDefinition } from "../types";
import { sourcePrivacy } from "./trigger-queued";

/**
 * An effect lasting "until the opponent pays N●" began; `payer` may pay
 * `cost` to end it (C7). One begun by a card in a hand or deck names that
 * card, so it is private to the side holding that zone; the payer still sees
 * the effect, with its source hidden, in its view.
 */
export interface PayableEffectRegisteredEvent {
  readonly kind: "payableEffectRegistered";
  readonly effect: EffectId;
  readonly payer: Side;
  readonly cost: number;
  readonly source: AbilitySource;
  /** The characters whose changes from the effect end with it. */
  readonly affects: readonly InstanceId[];
}

export const payableEffectRegistered: EventDefinition<PayableEffectRegisteredEvent> = {
  kind: "payableEffectRegistered",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
};
