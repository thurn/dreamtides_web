import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { BattleState, SparkGain } from "../../state/types";
import { seesSubject } from "../../view/knowledge";
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
  /** The sides that could not identify `subject` as the ability triggered; absent when both could. */
  readonly subjectHiddenFrom?: readonly Side[];
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

/**
 * Private to the holder of a source in a hand or deck. A side that may see
 * it sees its subject only as the view's queued trigger shows it
 * (`seesSubject`): one that could not identify the subject as the ability
 * triggered, such as the opponent of a side drawing a card, or cannot
 * identify it now, sees `null`.
 */
export const triggerQueued: EventDefinition<TriggerQueuedEvent> = {
  kind: "triggerQueued",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact: (event, viewer, state) => (event.subject === null || seesSubject(state, event, viewer) ? event : { ...event, subject: null }),
};
