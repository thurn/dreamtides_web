import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { SparkGain } from "../../state/types";
import { seesSubject } from "../../view/knowledge";
import { redactSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/** A triggered ability matched an event and joined the end of the trigger queue (D14). */
export interface TriggerQueuedEvent {
  readonly kind: "triggerQueued";
  /** The engine names it; it is `null` as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly source: AbilitySource | null;
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
 * Private to the holder of a source in a hand or deck (`sourcePrivacy`). A
 * side that may see it sees it as the view's queued trigger shows it: the
 * source only when it can identify it (`redactSource`), so the holder of a
 * deck card it has not learned sees the trigger without its card; the
 * subject only when it could identify it as the ability triggered and can
 * now (`seesSubject`), so the opponent of a side drawing a card sees `null`.
 */
export const triggerQueued: EventDefinition<TriggerQueuedEvent> = {
  kind: "triggerQueued",
  privateTo: (event, state) => sourcePrivacy(event.source, state),
  redact(event, viewer, state) {
    const seen = redactSource(event, viewer, state);
    return seen.subject === null || seesSubject(state, seen, viewer) ? seen : { ...seen, subject: null };
  },
};
