import type { AbilitySource, Side } from "../../state/ids";
import type { EventDefinition } from "../types";
import { sourcePrivacy } from "./trigger-queued";

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
  readonly sources: readonly AbilitySource[];
}

/**
 * Private to the side holding a source that is a card in a hand or deck (a
 * hidden trigger resolving `winTheGame`), like that trigger's own
 * `triggerQueued` and `triggerResolved` events; public otherwise. The
 * sources are all `side`'s, so at most one side holds hidden ones. The win
 * itself stays public through `battleEnded`.
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
};
