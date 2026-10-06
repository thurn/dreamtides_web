import type { AbilitySource, EffectId, Side } from "../../state/ids";
import type { Expiry, FloatingChange } from "../../state/types";
import type { EventDefinition } from "../types";
import { sourcePrivacy } from "./trigger-queued";

/**
 * A floating effect began: a change with a duration (rules § Durations). One
 * begun by a card in a hand or deck names that card, so it is private to the
 * side holding that zone.
 */
export interface EffectStartedEvent {
  readonly kind: "effectStarted";
  readonly effect: EffectId;
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly expiry: Expiry;
  readonly change: FloatingChange;
}

export const effectStarted: EventDefinition<EffectStartedEvent> = {
  kind: "effectStarted",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
};
