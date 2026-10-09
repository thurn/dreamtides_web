/**
 * How an event naming an ability's source shows it (engine-design § Views
 * and hidden information). An event whose source is a card in a hand or
 * deck is private to the side holding that zone (`sourcePrivacy`), and a
 * side that may see it sees the source only when it can identify it, as the
 * view shows a queued trigger's source (`seesSource`): the holder of a deck
 * card it has not learned sees the event with the source `null`.
 */
import type { AbilitySource, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { seesSource } from "../view/knowledge";

/**
 * The side an event naming `source` is private to: the side holding a card
 * in a hand or deck, else `null` (public), as for an avatar, a dreamsign, a
 * card in a public zone, or a card that has left the battle.
 */
export function sourcePrivacy(source: AbilitySource | null, state: BattleState): Side | null {
  if (source === null || typeof source !== "string") return null;
  const instance = state.instances[source];
  return instance?.zone === "hand" || instance?.zone === "deck" ? instance.controller : null;
}

/** `source` as `viewer` sees it in `state`: `null` when it cannot identify it (`seesSource`). */
export function seenSource(source: AbilitySource | null, viewer: Side, state: BattleState): AbilitySource | null {
  return source === null || seesSource(state, source, viewer) ? source : null;
}

/** `event` as `viewer` sees it in `state`, its `source` nulled when `viewer` cannot identify it (`seenSource`). */
export function redactSource<E extends { readonly source: AbilitySource | null }>(event: E, viewer: Side, state: BattleState): E {
  const source = seenSource(event.source, viewer, state);
  return source === event.source ? event : { ...event, source };
}
