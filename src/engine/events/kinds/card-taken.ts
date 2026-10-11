import type { InstanceId, Side, Zone } from "../../state/ids";
import { identifies } from "../../view/knowledge";
import type { EventDefinition } from "../types";

/**
 * `side` put a card into its hand from among a set of cards (rules §
 * Keywords and Effects → Erode, and § Zones → Hand): one of the cards an
 * effect just moved, or a card of the opponent's hand it looked at.
 */
export interface CardTakenEvent {
  readonly kind: "cardTaken";
  /** The side whose hand the card went into. */
  readonly side: Side;
  /** `null` as a side that cannot identify the card sees the event (`eventSeenBy`). */
  readonly instance: InstanceId | null;
  /** The zone the card left. */
  readonly from: Zone;
  /** The side holding that zone: the card's owner for a void or deck, the side holding the hand for a hand. */
  readonly holder: Side;
}

/**
 * Both sides see that a card was taken and from where; a side sees which
 * card only when it can identify it in the taker's hand. Both sides can
 * whenever the card left a public zone or a hand the taker looked at.
 */
export const cardTaken: EventDefinition<CardTakenEvent> = {
  kind: "cardTaken",
  privateTo: () => null,
  redact: (event, viewer, state) =>
    event.instance === null || identifies(state, event.instance, viewer) ? event : { ...event, instance: null },
};
