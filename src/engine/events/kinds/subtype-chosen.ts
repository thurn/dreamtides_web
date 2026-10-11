import type { CardSubtype } from "../../../types/card-identity";
import type { AbilitySource, Side } from "../../state/ids";
import { redactSource } from "../sources";
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
 * Both sides see the announced type, including a choice made by an ability
 * of a card in a hand or deck. Each side sees the source only when it can
 * identify it.
 */
export const subtypeChosen: EventDefinition<SubtypeChosenEvent> = {
  kind: "subtypeChosen",
  privateTo: () => null,
  redact: redactSource,
};
