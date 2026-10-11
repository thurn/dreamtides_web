import type { InstanceId, Side } from "../../state/ids";
import { identifies } from "../../view/knowledge";
import type { EventDefinition } from "../types";

/**
 * `side` looked at the top cards of its deck (rules § Keywords and Effects →
 * Look at the top N cards). The cards stay where they are; what the effect
 * then does with them, such as drawing some, is announced by its own events.
 */
export interface LookedAtTopEvent {
  readonly kind: "lookedAtTop";
  readonly side: Side;
  /** The cards looked at, topmost first; `null` for one the viewer cannot identify (`eventSeenBy`). */
  readonly cards: readonly (InstanceId | null)[];
}

/**
 * Both sides see how many cards were looked at; a side sees which only where
 * it can identify them: the looking side learned every card it looked at.
 */
export const lookedAtTop: EventDefinition<LookedAtTopEvent> = {
  kind: "lookedAtTop",
  privateTo: () => null,
  redact: (event, viewer, state) => ({
    ...event,
    cards: event.cards.map((id) => (id !== null && identifies(state, id, viewer) ? id : null)),
  }),
};
