import type { InstanceId, Side } from "../../state/ids";
import type { EventDefinition } from "../types";

export interface DiscardedEvent {
  readonly kind: "discarded";
  readonly side: Side;
  readonly instance: InstanceId;
}

/**
 * A discarded card is shown to both sides as it enters its owner's void
 * (rules § Zones → Hand), so the event is public while the card is in the
 * battle. A created card ceases to exist instead and is never shown to the
 * opponent, so once it is gone the event is private to `side`, which
 * discarded it.
 */
export const discarded: EventDefinition<DiscardedEvent> = {
  kind: "discarded",
  privateTo: (event, state) => (event.instance in state.instances ? null : event.side),
};
