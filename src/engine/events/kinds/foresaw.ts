import type { InstanceId, Side } from "../../state/ids";
import { identifies } from "../../view/knowledge";
import type { EventDefinition } from "../types";

/**
 * `side` foresaw: it looked at the top cards of its deck, put `voided` into
 * its void, and put `kept` back on top (rules § Keywords and Effects →
 * Foresee). The cards it looked at are `kept` and `voided` together.
 */
export interface ForesawEvent {
  readonly kind: "foresaw";
  readonly side: Side;
  /** The cards put back on top, topmost first; `null` for one the viewer cannot identify (`eventSeenBy`). */
  readonly kept: readonly (InstanceId | null)[];
  /** The cards put into the void, in the order they went there; `null` for one the viewer cannot identify. */
  readonly voided: readonly (InstanceId | null)[];
}

/**
 * Both sides see how many cards were looked at and where each went; a side
 * sees which cards only where it can identify them: the foreseeing side
 * learned every card it looked at, and a voided card is public in the void.
 */
export const foresaw: EventDefinition<ForesawEvent> = {
  kind: "foresaw",
  privateTo: () => null,
  redact: (event, viewer, state) => {
    const seen = (id: InstanceId | null) => (id !== null && identifies(state, id, viewer) ? id : null);
    return { ...event, kept: event.kept.map(seen), voided: event.voided.map(seen) };
  },
};
