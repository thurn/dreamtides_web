import type { AbilitySource, Side } from "../../state/ids";
import { publicEvent } from "../types";

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

export const winConditionMet = publicEvent<WinConditionMetEvent>("winConditionMet");
