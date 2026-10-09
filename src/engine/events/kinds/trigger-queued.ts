import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { BattleState, SparkGain } from "../../state/types";
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
  /** The gain a "when … gains ✦" trigger matched; absent for any other trigger. */
  readonly gain?: SparkGain;
}

/**
 * An event naming a card in a hand or deck as its source is private to the
 * side holding that zone; other sources are public.
 */
export function sourcePrivacy(source: AbilitySource, state: BattleState): Side | null {
  if (typeof source !== "string") return null;
  const instance = state.instances[source];
  return instance?.zone === "hand" || instance?.zone === "deck" ? instance.controller : null;
}

export const triggerQueued: EventDefinition<TriggerQueuedEvent> = {
  kind: "triggerQueued",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
};
