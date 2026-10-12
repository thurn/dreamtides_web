/**
 * Layer 6, play permissions (rules § Playing Cards and the Stack → Playing
 * from the void): "You may play ≤2● cost characters from your void" lets a
 * player play matching cards in the void it owns for their normal costs. A
 * permission naming a card covers that card only, and a `next` permission,
 * made by a resolving effect, covers one play and ends as that card is
 * played.
 */
import type { EngineCatalog } from "../catalog";
import type { EffectId, InstanceId, OncePerTurnKey, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { characteristics, filterSubjectOf, matchesFilter } from "./characteristics";
import { oncePerTurnKey } from "../rules/activation";
import type { Layers } from "./layers";
import { identifies } from "../view/knowledge";
import { SIDES } from "../state/ids";

/** The permission one play from the void or identified deck top uses. */
export interface PlayPermission {
  /** The `next` permission the play uses up; `null` when a lasting permission covers it. */
  readonly consumes: EffectId | null;
  /** The static ability allowance recorded on a committed permission play. */
  readonly oncePerTurn?: OncePerTurnKey;
}

/**
 * The permission that lets `player` play `card` from its void now, read from
 * `layers` (the state's evaluation), or `null` when none does: an
 * unlimited permission when one covers the card, else the earliest unused
 * once-per-turn static permission, else the earliest `next` one. Only a
 * card in the void `player` owns, or its identified current deck top, is covered.
 */
export function playPermission(
  state: BattleState,
  catalog: EngineCatalog,
  card: InstanceId,
  player: Side,
  layers: Layers = characteristics(state, catalog),
): PlayPermission | null {
  const zone = state.instances[card]?.zone;
  if (zone === "deck") {
    if (state.instances[card]?.owner !== player || state.sides[player].deck[0] !== card || !identifies(state, card, player)) return null;
  } else if (zone !== "void" || !state.sides[player].void.includes(card)) return null;
  let next: EffectId | null = null;
  let once: OncePerTurnKey | null = null;
  const subject = filterSubjectOf(state, catalog, card, layers.of(card));
  for (const { change, effect, staticSource, staticAbility } of layers.changes(6)) {
    if (change.kind !== "playFrom" || change.player !== player || change.zone !== zone) continue;
    if ((change.instance !== null && change.instance !== card) || !matchesFilter(subject, change.filter)) continue;
    if (change.oncePerTurn === true) {
      if (staticSource === null || staticAbility === null) continue;
      const timestamp = typeof staticSource === "string" ? state.instances[staticSource]?.enteredZoneAt : undefined;
      const key = oncePerTurnKey(staticSource, staticAbility, timestamp);
      if (!state.oncePerTurn.includes(key)) once ??= key;
      continue;
    }
    if (!change.next || effect === null) return { consumes: null };
    next ??= effect;
  }
  return once !== null ? { consumes: null, oncePerTurn: once } : next === null ? null : { consumes: next };
}

/** Current tops a continuous reveal instruction covers; nothing deeper is inspected. */
export function continuouslyRevealedTops(state: BattleState, catalog: EngineCatalog): readonly { readonly side: Side; readonly card: InstanceId }[] {
  const players = new Set(characteristics(state, catalog).revealedDeckTopPlayers());
  return SIDES.flatMap((side) => {
    const card = state.sides[side].deck[0];
    return players.has(side) && card !== undefined ? [{ side, card }] : [];
  });
}
