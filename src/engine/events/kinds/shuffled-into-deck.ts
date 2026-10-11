import type { InstanceId, Side, Zone } from "../../state/ids";
import type { EventDefinition } from "../types";

/** Zones whose cards both sides see as they leave. */
const PUBLIC_ZONES: readonly Zone[] = ["stack", "play", "void", "banished"];

/**
 * `side`'s deck was shuffled by an effect that shuffles cards into it (rules §
 * Keywords and Effects → Shuffle into a deck), after `cards` entered it.
 * `cards` may be empty: the deck is shuffled even when no card moved. Once it
 * is shuffled, neither side can place any card in it.
 *
 * `from` and `seenBy` run parallel to `cards`: the zone each card left, and
 * the sides that could identify it there as it left.
 */
export interface ShuffledIntoDeckEvent {
  readonly kind: "shuffledIntoDeck";
  /** The deck's owner. */
  readonly side: Side;
  /** The cards put into the deck, in the order they moved; `null` for one the viewer cannot identify (`eventSeenBy`). */
  readonly cards: readonly (InstanceId | null)[];
  readonly from: readonly Zone[];
  readonly seenBy: readonly (readonly Side[])[];
}

/**
 * Both sides see that the deck was shuffled, how many cards entered it, and
 * from which zones. A side sees which card entered when it could identify
 * the card as it left: both sides for a public zone such as a void, only the
 * side holding it (or one that had learned it) for a hand. The redaction
 * reads the event, not the state it arrives with, since after the shuffle
 * neither side can place the card.
 */
export const shuffledIntoDeck: EventDefinition<ShuffledIntoDeckEvent> = {
  kind: "shuffledIntoDeck",
  privateTo: () => null,
  redact: (event, viewer) => ({
    ...event,
    cards: event.cards.map((id, index) => {
      const from = event.from[index];
      const seen = (from !== undefined && PUBLIC_ZONES.includes(from)) || event.seenBy[index]?.includes(viewer) === true;
      return id !== null && seen ? id : null;
    }),
  }),
};
