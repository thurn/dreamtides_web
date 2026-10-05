import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { BattleState } from "../../state/types";
import type { EventDefinition } from "../types";

/** A triggered ability matched an event and joined the end of the trigger queue (D14). */
export interface TriggerQueuedEvent {
  readonly kind: "triggerQueued";
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly ability: number;
  /** A floating or delayed trigger's node; `null` for a triggered ability. */
  readonly node: number | null;
  readonly subject: InstanceId | null;
}

/** A card's ability that triggers from a hand or deck is private to the side holding that zone. */
export function triggerPrivacy(source: AbilitySource, controller: Side, state: BattleState): Side | null {
  if (typeof source !== "string") return null;
  const zone = state.instances[source]?.zone;
  return zone === "hand" || zone === "deck" ? controller : null;
}

export const triggerQueued: EventDefinition<TriggerQueuedEvent> = {
  kind: "triggerQueued",
  privateTo: (event, state) => triggerPrivacy(event.source, event.controller, state),
};
