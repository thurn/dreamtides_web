/**
 * Knowledge tracking (engine-design § Views and hidden information): which
 * cards in decks and hands each side can identify. A card in a public zone
 * is known to both sides and a card in a hand to the side holding it; beyond
 * that, `state.knownTo[side]` lists the hidden cards `side` has learned:
 *
 * - a card keeps every side that could see it as it moves, so a card
 *   returned to a hand from play, or put into a deck from a hand, stays
 *   known to whoever watched it move;
 * - a revealed card becomes known to both sides;
 * - a `privateTo` prompt shows its cards to its chooser only, and the other
 *   side loses track of those still in a deck, whose order the chooser may
 *   change.
 *
 * Decks start unknown to both sides; the opening shuffle happens before any
 * card is known.
 */
import type { InstanceId, Side } from "../state/ids";
import { SIDES } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";

/** Whether `side` can identify `instance` where it is now. */
export function knows(state: BattleState, instance: CardInstance, side: Side): boolean {
  switch (instance.zone) {
    case "stack":
    case "play":
    case "void":
    case "banished":
      return true;
    case "hand":
      return instance.controller === side || state.knownTo[side].includes(instance.id);
    case "deck":
      return state.knownTo[side].includes(instance.id);
  }
}

/** Whether `side` can identify the card `id` in `state`: it is still in the battle and `side` knows it where it is. */
export function identifies(state: BattleState, id: InstanceId, side: Side): boolean {
  const instance = state.instances[id];
  return instance !== undefined && knows(state, instance, side);
}

/** The sides that cannot identify the card `id` in `state`. */
export function sidesBlindTo(state: BattleState, id: InstanceId): Side[] {
  return SIDES.filter((side) => !identifies(state, id, side));
}

/**
 * Whether `viewer` sees the subject of a queued trigger in `state`: it could
 * identify the subject as the ability triggered (`subjectHiddenFrom`) and
 * can identify it now. A card that was hidden then stays hidden as that
 * trigger's subject even once it is public, so a trigger never tells which
 * card a hidden draw or discard concerned.
 */
export function seesSubject(
  state: BattleState,
  trigger: { readonly subject: InstanceId | null; readonly subjectHiddenFrom?: readonly Side[] },
  viewer: Side,
): boolean {
  return trigger.subject !== null && trigger.subjectHiddenFrom?.includes(viewer) !== true && identifies(state, trigger.subject, viewer);
}

/** Whether `side` sees `instance` without a `knownTo` entry: it is in a public zone or in `side`'s hand. */
function seenByZone(instance: CardInstance, side: Side): boolean {
  return instance.zone === "hand" ? instance.controller === side : instance.zone !== "deck";
}

function learn(state: BattleState, side: Side, instance: CardInstance): void {
  if (!seenByZone(instance, side) && !state.knownTo[side].includes(instance.id)) {
    state.knownTo[side].push(instance.id);
  }
}

function unlearn(state: BattleState, side: Side, id: InstanceId): void {
  if (state.knownTo[side].includes(id)) {
    state.knownTo[side] = state.knownTo[side].filter((known) => known !== id);
  }
}

/**
 * Called as an instance leaves its zone: drops its `knownTo` entries and
 * returns the sides that could see it, for `settle` once it has moved.
 */
export function departKnowledge(state: BattleState, instance: CardInstance): Side[] {
  const seers = SIDES.filter((side) => knows(state, instance, side));
  for (const side of SIDES) unlearn(state, side, instance.id);
  return seers;
}

/** Called once an instance has entered its new zone: every side that watched it move still knows it. */
export function settleKnowledge(state: BattleState, instance: CardInstance, seers: readonly Side[]): void {
  for (const side of seers) learn(state, side, instance);
}

/** Both sides learn the revealed cards. */
export function revealToBoth(state: BattleState, ids: readonly InstanceId[]): void {
  for (const id of ids) {
    const instance = state.instances[id];
    if (instance === undefined) continue;
    for (const side of SIDES) learn(state, side, instance);
  }
}

/**
 * A `privateTo` prompt shows `ids` to `side` only. The other side loses track
 * of those in a deck: the chooser may reorder them.
 */
export function showPrivately(state: BattleState, side: Side, ids: readonly InstanceId[]): void {
  for (const id of ids) {
    const instance = state.instances[id];
    if (instance === undefined) continue;
    if (instance.zone === "deck") {
      for (const other of SIDES) if (other !== side) unlearn(state, other, id);
    }
    learn(state, side, instance);
  }
}
