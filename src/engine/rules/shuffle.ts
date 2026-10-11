import type { Side } from "../state/ids";
import { shuffleInPlace } from "../state/rng";
import type { BattleState } from "../state/types";
import { forgetShuffledDeck } from "../view/knowledge";

/** Shuffles a deck from its owner's stream and clears both viewers' knowledge of its cards. */
export function shuffleDeck(state: BattleState, side: Side): void {
  const deck = state.sides[side].deck;
  shuffleInPlace(state, `shuffle:${side}`, deck);
  forgetShuffledDeck(state, deck);
}
