/**
 * Effective characteristics for rules code, the view, and legality, with
 * memoization per committed state. A step mutates its private work state in
 * place while its version stays the same, so only a committed state, which
 * is never mutated again, is memoized: the engine facade remembers each
 * state it is handed, keyed by the state object and its version, in the
 * catalog's memo. Reads of any other state evaluate afresh. The memo holds
 * derived data only and never enters `BattleState`.
 */
import type { EngineCatalog } from "../catalog";
import type { CardFilter } from "../dsl/types";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import { Layers, type Characteristics } from "./layers";

export type { Characteristics } from "./layers";

/** Layer evaluations of committed states, by state object; each records the version it was built for. */
export type CharacteristicsMemo = WeakMap<BattleState, { readonly version: number; readonly layers: Layers }>;

/** The layer evaluation of `state`: memoized when the state was remembered at its current version. */
export function characteristics(state: BattleState, catalog: EngineCatalog): Layers {
  const entry = catalog.memo.get(state);
  return entry !== undefined && entry.version === state.version ? entry.layers : new Layers(state, catalog);
}

/** Memoizes the layer evaluation of a committed state, which is never mutated again. */
export function rememberCharacteristics(state: BattleState, catalog: EngineCatalog): Layers {
  const layers = characteristics(state, catalog);
  catalog.memo.set(state, { version: state.version, layers });
  return layers;
}

/** One card's effective characteristics. */
export function characteristicsOf(state: BattleState, catalog: EngineCatalog, id: InstanceId): Characteristics {
  return characteristics(state, catalog).of(id);
}

/** Whether characteristics match a card filter: type, and subtype unless the card has all types. */
export function matchesFilter(card: Characteristics, filter: CardFilter): boolean {
  return (
    (filter.cardType === undefined || card.cardType === filter.cardType) &&
    (filter.subtype === undefined || card.allTypes || card.subtype === filter.subtype)
  );
}

/** Whether a card matches a card filter by its effective type and subtype. */
export function cardMatchesFilter(state: BattleState, catalog: EngineCatalog, id: InstanceId, filter: CardFilter): boolean {
  if (state.instances[id] === undefined) return false;
  return (filter.cardType === undefined && filter.subtype === undefined) || matchesFilter(characteristicsOf(state, catalog, id), filter);
}
