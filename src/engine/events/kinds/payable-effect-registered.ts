import type { AbilitySource, EffectId, InstanceId, Side } from "../../state/ids";
import { redactSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/** An effect lasting "until the opponent pays N●" began; `payer` may pay `cost` to end it (C7). */
export interface PayableEffectRegisteredEvent {
  readonly kind: "payableEffectRegistered";
  readonly effect: EffectId;
  readonly payer: Side;
  readonly cost: number;
  /** The engine names it; it is `null` as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly source: AbilitySource | null;
  /** The characters whose changes from the effect end with it. */
  readonly affects: readonly InstanceId[];
}

/**
 * One begun by a card in a hand or deck is private to the side holding that
 * zone, showing the source only to a side that can identify it, like
 * `triggerQueued`. The payer still sees the effect, with its source hidden,
 * in its view.
 */
export const payableEffectRegistered: EventDefinition<PayableEffectRegisteredEvent> = {
  kind: "payableEffectRegistered",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact: redactSource,
};
