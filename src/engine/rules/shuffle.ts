import { SIDES, type Side } from "../state/ids";
import { shuffleInPlace } from "../state/rng";
import type { BattleState } from "../state/types";

/** Shuffles a deck from its owner's stream and clears both viewers' knowledge of its cards. */
export function shuffleDeck(state: BattleState, side: Side): void {
  const deck = state.sides[side].deck;
  shuffleInPlace(state, `shuffle:${side}`, deck);
  for (const viewer of SIDES) {
    state.knownTo[viewer] = state.knownTo[viewer].filter((id) => !deck.includes(id));
  }
}
