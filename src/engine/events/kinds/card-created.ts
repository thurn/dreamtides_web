import type { InstanceId, Side, Zone } from "../../state/ids";
import type { Printing } from "../../state/types";
import type { EventDefinition } from "../types";

/** A created card came into the battle in `zone` for `side`: a figment, a copy, or a card created in a hand. */
export interface CardCreatedEvent {
  readonly kind: "cardCreated";
  readonly instance: InstanceId;
  readonly side: Side;
  readonly printing: Printing;
  readonly zone: Zone;
}

/** A card created in a hand is private to the side holding it. */
export const cardCreated: EventDefinition<CardCreatedEvent> = {
  kind: "cardCreated",
  privateTo: (event) => (event.zone === "hand" ? event.side : null),
};
