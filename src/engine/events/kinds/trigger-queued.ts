import type { LinkedSourceContext } from "../../state/types";
import type { AbilitySource, InstanceId, Side } from "../../state/ids";
import type { SparkGain } from "../../state/types";
import { seesHandCopySubject, seesSubject } from "../../view/knowledge";
import { redactSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/** A triggered ability or drawn Dreamwell event bonus joined the resolution FIFO (D14). */
export interface TriggerQueuedEvent {
  /** Public chosen-type specialization of this floating installation. */
  readonly chosenSubtype?: import("../../../types/card-identity").CardSubtype;
  readonly abandonedNamed?: import("../../state/types").AbandonedNamedBinding;
  /** Authoritative causal data for the production log; public events omit it. */
  readonly triggeringAbility?: import("../../state/types").QueuedTrigger["triggeringAbility"];
  readonly linkedSource?: LinkedSourceContext;
  readonly handCopy?: import("../../state/types").HandCopyContext;
  /** Authoritative causal values; public event projection omits them. */
  readonly abandonedCopy?: import("../../state/types").AbandonedCopyContext;
  readonly kind: "triggerQueued";
  /** The engine names it; it is `null` as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly source: AbilitySource | null;
  readonly controller: Side;
  readonly ability: number;
  /** A floating or delayed trigger's node; `null` for a triggered ability. */
  readonly node: number | null;
  readonly subject: InstanceId | null;
  /** Retained subject cost, visible only to sides that observed the subject at triggering. */
  readonly lastKnownSubjectCost?: number;
  /** Public predeparture spark; its historical subject need not remain identifiable. */
  readonly lastKnownSubjectSpark?: number;
  /** The sides that could not identify `subject` as the ability triggered; absent when both could. */
  readonly subjectHiddenFrom?: readonly Side[];
  /** The gain a "when … gains ✦" trigger matched; absent for any other trigger. */
  readonly gain?: SparkGain;
  /** The positive challenge award a scoring trigger matched; absent for other triggers. */
  readonly scored?: number;
  /** Public positive count captured from one completed discard occasion. */
  readonly discardedCount?: number;
  readonly lastKnownSourceSpark?: number;
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
    const { triggeringAbility: _cause, abandonedNamed: _abandoned, abandonedCopy: _abandonedCopy, ...publicEvent } = event;
    const redacted = redactSource(publicEvent, viewer, state);
    const { lastKnownSubjectCost: _subjectCost, ...withoutCost } = redacted;
    const costSeen = redacted.source !== null && redacted.subjectHiddenFrom?.includes(viewer) !== true ? redacted : withoutCost;
    const { lastKnownSourceSpark, lastKnownSubjectSpark, linkedSource, ...anonymous } = costSeen;
    const seen = costSeen.source === null && (lastKnownSourceSpark !== undefined || lastKnownSubjectSpark !== undefined || linkedSource !== undefined) ? anonymous : costSeen;
    const { handCopy, ...withoutCopy } = seen;
    const projected = handCopy === undefined || seen.source !== null && handCopy.copier === viewer ? seen : withoutCopy;
    return projected.subject === null || seesSubject(state, seen, viewer) || seesHandCopySubject(state, seen, viewer) ? projected : { ...projected, subject: null };
  },
};
