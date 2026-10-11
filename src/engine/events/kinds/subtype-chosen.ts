import type { CardSubtype } from "../../../types/card-identity";
import type { AbilitySource, Side } from "../../state/ids";
import { redactSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/**
 * `side` chose the character type `subtype` for an ability of `source` as
 * it resolved (rules § Keywords and Effects → Choose a character type).
 */
export interface SubtypeChosenEvent {
  readonly kind: "subtypeChosen";
  readonly side: Side;
  /** `null` as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly source: AbilitySource | null;
  readonly subtype: CardSubtype;
}

/**
 * The choice is announced: both sides see it, except that one made by an
 * ability of a card in a hand or deck is private to the side holding that
 * zone, showing the source only to a side that can identify it, like
 * `triggerQueued`.
 */
export const subtypeChosen: EventDefinition<SubtypeChosenEvent> = {
  kind: "subtypeChosen",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact: redactSource,
};
