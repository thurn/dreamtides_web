import type { AbilitySource, EffectId, Side } from "../../state/ids";
import type { Expiry, FloatingChange } from "../../state/types";
import { seesSource } from "../../view/knowledge";
import { sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/** A floating effect began: a change with a duration (rules § Durations). */
export interface EffectStartedEvent {
  readonly kind: "effectStarted";
  readonly effect: EffectId;
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly expiry: Expiry;
  readonly change: FloatingChange;
}

/**
 * One begun by a card in a hand or deck is private to the side holding that
 * zone (`sourcePrivacy`), and a side that cannot identify the source sees
 * none of it, as the view omits the floating effect: its change can name the
 * source's card (a delayed trigger's `ref.origin`). So the holder of a deck
 * card it has not learned does not see the effect begin either.
 */
export const effectStarted: EventDefinition<EffectStartedEvent> = {
  kind: "effectStarted",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact: (event, viewer, state) => (seesSource(state, event.source, viewer) ? event : null),
};
