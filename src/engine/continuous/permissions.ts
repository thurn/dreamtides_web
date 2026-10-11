/**
 * Layer 6, play permissions (rules § Playing Cards and the Stack → Playing
 * from the void): "You may play ≤2● cost characters from your void" lets a
 * player play matching cards in the void it owns for their normal costs. A
 * permission naming a card covers that card only, and a `next` permission,
 * made by a resolving effect, covers one play and ends as that card is
 * played.
 */
import type { EngineCatalog } from "../catalog";
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { characteristics, filterSubjectOf, matchesFilter } from "./characteristics";
import type { Layers } from "./layers";

/** The permission one play from the void uses. */
export interface PlayPermission {
  /** The `next` permission the play uses up; `null` when a lasting permission covers it. */
  readonly consumes: EffectId | null;
}

/**
 * The permission that lets `player` play `card` from its void now, read from
 * `layers` (the state's evaluation), or `null` when none does: a lasting
 * permission when one covers the card, else the earliest `next` one. Only a
 * card in the void `player` owns is ever covered.
 */
export function playPermission(
  state: BattleState,
  catalog: EngineCatalog,
  card: InstanceId,
  player: Side,
  layers: Layers = characteristics(state, catalog),
): PlayPermission | null {
  if (!state.sides[player].void.includes(card)) return null;
  let next: EffectId | null = null;
  const subject = filterSubjectOf(state, catalog, card, layers.of(card));
  for (const { change, effect } of layers.changes(6)) {
    if (change.kind !== "playFrom" || change.player !== player || change.zone !== "void") continue;
    if ((change.instance !== null && change.instance !== card) || !matchesFilter(subject, change.filter)) continue;
    if (!change.next || effect === null) return { consumes: null };
    next ??= effect;
  }
  return next === null ? null : { consumes: next };
}
