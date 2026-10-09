import type { AbilitySource, Side } from "../../state/ids";
import { redactSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/**
 * A queued trigger began resolving. `applied` is false when its intervening
 * "if" no longer holds, so it does nothing.
 */
export interface TriggerResolvedEvent {
  readonly kind: "triggerResolved";
  /** The engine names it; it is `null` as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly source: AbilitySource | null;
  readonly controller: Side;
  readonly ability: number;
  readonly node: number | null;
  readonly applied: boolean;
}

/** Private to the holder of a source in a hand or deck, showing the source only to a side that can identify it, like `triggerQueued`. */
export const triggerResolved: EventDefinition<TriggerResolvedEvent> = {
  kind: "triggerResolved",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact: redactSource,
};
