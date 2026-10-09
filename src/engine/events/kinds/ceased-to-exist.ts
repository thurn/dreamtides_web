import type { InstanceId, Side, Zone } from "../../state/ids";
import type { EventDefinition } from "../types";

/** A created card ceased to exist: it is gone from the battle and in no zone. */
export interface CeasedToExistEvent {
  readonly kind: "ceasedToExist";
  readonly instance: InstanceId;
  /** The side that controlled it, the holder of a card in a hand. */
  readonly side: Side;
  /** The zone it left. */
  readonly from: Zone;
}

/**
 * A card that ceased to exist from a hand or deck was never shown to the
 * other side there, so the event is private to `side`, its holder (rules §
 * Created Cards); one that left a public zone is public.
 */
export const ceasedToExist: EventDefinition<CeasedToExistEvent> = {
  kind: "ceasedToExist",
  privateTo: (event) => (event.from === "hand" || event.from === "deck" ? event.side : null),
};
