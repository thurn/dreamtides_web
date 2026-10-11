import type { InstanceId, Side, Zone } from "../../state/ids";
import type { EventDefinition } from "../types";

/**
 * Cards were put on top of `side`'s deck, on the bottom of it, or into its
 * void (rules § Keywords and Effects → Put on top or on the bottom of a deck,
 * and → Look at the top N cards). The deck is not shuffled.
 *
 * `cards`, `from`, and `seenBy` run parallel: each card, topmost first for a
 * deck (in the order it went for a void), the zone it left, and the sides
 * that could identify it where it went, which are the sides that saw it go
 * there.
 */
export interface CardsPlacedEvent {
  readonly kind: "cardsPlaced";
  /** The owner of the deck or void. */
  readonly side: Side;
  readonly to: "deckTop" | "deckBottom" | "void";
  /** `null` for a card the viewer cannot identify (`eventSeenBy`). */
  readonly cards: readonly (InstanceId | null)[];
  readonly from: readonly Zone[];
  readonly seenBy: readonly (readonly Side[])[];
}

/**
 * Both sides see how many cards went where and from which zones; a side
 * sees which card only when it could identify the card where it went: both
 * sides for a card from a void or from play, or one put into a void; the
 * looker for a looked-at card; the holder for a hand card. The redaction
 * reads the event's own `seenBy`, so a later shuffle in the same step that
 * ends that knowledge does not change what the event showed.
 */
export const cardsPlaced: EventDefinition<CardsPlacedEvent> = {
  kind: "cardsPlaced",
  privateTo: () => null,
  redact: (event, viewer) => ({
    ...event,
    cards: event.cards.map((id, index) => (id !== null && event.seenBy[index]?.includes(viewer) === true ? id : null)),
  }),
};
