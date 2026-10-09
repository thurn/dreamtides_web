import type { AbilitySource, Side } from "../../state/ids";
import { seenSource, sourcePrivacy } from "../sources";
import type { EventDefinition } from "../types";

/**
 * A "you win the game" condition held for `side` (C15): either the victory
 * check (P5) found win conditions of cards in play and emblems it controls
 * holding (`sources` in ability-source order), or a `winTheGame` effect
 * resolved (`sources` is its card or emblem). The step's victory check
 * applies the win, and a `battleEnded` event follows in that check.
 */
export interface WinConditionMetEvent {
  readonly kind: "winConditionMet";
  readonly side: Side;
  /** The engine names each; one is `null` as a side that cannot identify it sees the event (`eventSeenBy`). */
  readonly sources: readonly (AbilitySource | null)[];
}

/**
 * Private to the side holding a source that is a card in a hand or deck (a
 * hidden trigger resolving `winTheGame`), like that trigger's own
 * `triggerQueued` and `triggerResolved` events, and showing a source only to
 * a side that can identify it; public otherwise. The sources are all
 * `side`'s, so at most one side holds hidden ones. The win itself stays
 * public through `battleEnded`.
 */
export const winConditionMet: EventDefinition<WinConditionMetEvent> = {
  kind: "winConditionMet",
  privateTo(event, state) {
    for (const source of event.sources) {
      const holder = sourcePrivacy(source, state);
      if (holder !== null) return holder;
    }
    return null;
  },
  redact(event, viewer, state) {
    const sources = event.sources.map((source) => seenSource(source, viewer, state));
    return sources.every((source, index) => source === event.sources[index]) ? event : { ...event, sources };
  },
};
