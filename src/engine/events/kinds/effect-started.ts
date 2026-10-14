import { changedInstance, keptWithoutSource } from "../../rules/floating";
import type { AbilitySource, EffectId, InstanceId, Side } from "../../state/ids";
import type { BattleState, Expiry, FloatingChange } from "../../state/types";
import { combinedSourceObservers, identifies, seesSource } from "../../view/knowledge";
import { sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/** A floating effect began: a change with a duration (rules § Durations). */
export interface EffectStartedEvent {
  readonly kind: "effectStarted";
  readonly effect: EffectId;
  readonly controller: Side;
  /**
   * The effect's source; `null` in the projection for a viewer that cannot
   * identify its causal relationship but sees the effect begin (`effectStarted.redact`).
   */
  readonly source: AbilitySource | null;
  readonly expiry: Expiry;
  readonly change: FloatingChange;
  /** Complete emission-time observers of ordinary, additional, and physical triggering-card spark announcements. */
  readonly sparkSeenBy?: readonly Side[];
}

/**
 * The public card a change kept without its source (rules/floating.ts
 * `keptWithoutSource`, such as a loss of abilities) changes, or `null`. The
 * view shows such a change to every side that identifies its card, so the
 * event announcing it does too, whatever became of its source.
 */
function keptPublicCard(event: EffectStartedEvent, state: BattleState): InstanceId | null {
  const changed = changedInstance(event.change);
  if (changed === null || !keptWithoutSource(event.change)) return null;
  const zone = state.instances[changed]?.zone;
  return zone === "play" || zone === "void" || zone === "banished" || zone === "stack" ? changed : null;
}

/**
 * One begun by a card in a hand or deck is private to the side holding that
 * zone (`sourcePrivacy`), and a side that cannot identify the source sees
 * none of it, as the view omits the floating effect: its change can name the
 * source's card (a delayed trigger's `ref.origin`). So the holder of a deck
 * card it has not learned does not see the effect begin either. Likewise a
 * side that cannot identify the card the change changes (`changedInstance`),
 * such as a card just drawn into the opponent's hand, sees none of it. A
 * change the view keeps without its source on a card in a public zone
 * (`keptPublicCard`) is the exception: every side that identifies that card
 * sees it begin, with the source `null` when it cannot identify the source,
 * such as a created card that has ceased to exist. A trigger's captured cards
 * list only those the side can identify. Combined disabling uses its recorded
 * creation-time causal observers; physical revelation alone does not expose
 * that relationship. Missing legacy flags retain current public-source
 * visibility, while explicit flags govern recorded observations.
 */
export const effectStarted: EventDefinition<EffectStartedEvent> = {
  kind: "effectStarted",
  privateTo: (event, state) => event.change.kind === "spark" && event.sparkSeenBy !== undefined
    ? null : (keptPublicCard(event, state) === null ? sourcePrivacy(event.source, state) : null),
  redact: (event, viewer, state) => {
    if (event.change.kind === "spark" && event.sparkSeenBy !== undefined) {
      return event.sparkSeenBy.includes(viewer) ? event : null;
    }
    const changed = changedInstance(event.change);
    if (changed !== null && !identifies(state, changed, viewer)) return null;
    // A public base-spark setting still keeps its source-dependent expiry identity private.
    if (event.change.kind === "baseSpark" && event.expiry.at === "sourceLeavesPlay" && !identifies(state, event.expiry.source, viewer)) return null;
    const combined = event.change.kind === "disableTriggers" && event.change.mode === "triggeredAndActivated";
    const flags = state.floating.find(effect => effect.id === event.effect)?.sourceObservedBy;
    const observed = !combined || event.source !== null && event.change.kind === "disableTriggers" &&
      (flags ?? combinedSourceObservers(state, event.source, event.change.instance)).includes(viewer);
    if (!observed || event.source === null || !seesSource(state, event.source, viewer)) {
      return keptPublicCard(event, state) === null ? null : { ...event, source: null };
    }
    const { change } = event;
    if (change.kind !== "trigger" || change.captured === undefined) return event;
    const captured = change.captured.filter((id) => identifies(state, id, viewer));
    return captured.length === change.captured.length ? event : { ...event, change: { ...change, captured } };
  },
};
