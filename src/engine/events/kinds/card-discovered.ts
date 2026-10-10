import type { InstanceId, Side } from "../../state/ids";
import { identifies } from "../../view/knowledge";
import type { EventDefinition } from "../types";

/** `side` discovered a card: it went from that side's deck into its hand (rules § Keywords and Effects → Discover). */
export interface CardDiscoveredEvent {
  readonly kind: "cardDiscovered";
  readonly side: Side;
  /** `null` as a side that cannot identify the card sees the event (`eventSeenBy`). */
  readonly instance: InstanceId | null;
}

/**
 * Both sides see that a card was discovered; only a side that can identify
 * it, the discovering side holding it in its hand, sees which.
 */
export const cardDiscovered: EventDefinition<CardDiscoveredEvent> = {
  kind: "cardDiscovered",
  privateTo: () => null,
  redact: (event, viewer, state) =>
    event.instance === null || identifies(state, event.instance, viewer) ? event : { ...event, instance: null },
};
