import type { AbilitySource } from "../../state/ids";
import { redactSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/** A required choice had no legal option at resolution, so that part of the effect did nothing. */
export interface NoLegalTargetEvent {
  readonly kind: "noLegalTarget";
  /** `null` also as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly source: AbilitySource | null;
}

/**
 * One for an ability of a card in a hand or deck, such as a hidden trigger
 * resolving, is private to the side holding that zone, showing the source
 * only to a side that can identify it, like `triggerQueued`.
 */
export const noLegalTarget: EventDefinition<NoLegalTargetEvent> = {
  kind: "noLegalTarget",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact: redactSource,
};
