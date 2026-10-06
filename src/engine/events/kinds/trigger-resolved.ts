import type { AbilitySource, Side } from "../../state/ids";
import type { EventDefinition } from "../types";
import { sourcePrivacy } from "./trigger-queued";

/**
 * A queued trigger began resolving. `applied` is false when its intervening
 * "if" no longer holds, so it does nothing.
 */
export interface TriggerResolvedEvent {
  readonly kind: "triggerResolved";
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly ability: number;
  readonly node: number | null;
  readonly applied: boolean;
}

export const triggerResolved: EventDefinition<TriggerResolvedEvent> = {
  kind: "triggerResolved",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
};
