/**
 * Effective characteristics for rules code, the view, and legality, with
 * memoization per committed state. A step mutates its private work state in
 * place while its version stays the same, so only a committed state, which
 * is never mutated again, is memoized: the engine facade remembers each
 * state it is handed, keyed by the state object and its version, in the
 * catalog's memo. Reads of any other state evaluate afresh. The memo holds
 * derived data only and never enters `BattleState`.
 */
import { instanceCard, type EngineCatalog } from "../catalog";
import { fixedEnergy } from "../dsl/energy";
import type { CardFilter } from "../dsl/types";
import type { InstanceId } from "../state/ids";
import type { BattleState, PlayedCard } from "../state/types";
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

/**
 * A card's cost for cost conditions: its copiable cost, the fixed energy of
 * its printed cost after its variant and deck-entry modifications, with X
 * counting as 0: 0● for a figment, the copied cost for a figment copy (C13).
 * Cost modifications apply only to playing a card. An instance's copiable
 * cost never changes while it exists.
 */
export function copiableCostOf(state: BattleState, catalog: EngineCatalog, id: InstanceId): number {
  const instance = state.instances[id];
  if (instance === undefined) throw new Error(`Unknown instance ${id}`);
  return fixedEnergy(instanceCard(catalog, instance).costs);
}

/** What a card filter compares: a card's type, subtype, and "has all character types", and its copiable cost. */
export interface FilterSubject extends Pick<Characteristics, "cardType" | "subtype" | "allTypes"> {
  readonly cost: number;
}

/**
 * Whether a card matches a card filter: type; subtype, unless the card has
 * all types; and copiable cost within the bounds. A played card's turn-log
 * record matches the same way.
 */
export function matchesFilter(card: FilterSubject, filter: CardFilter): boolean {
  return (
    (filter.cardType === undefined || card.cardType === filter.cardType) &&
    (filter.subtype === undefined || card.allTypes || card.subtype === filter.subtype) &&
    (filter.costAtMost === undefined || card.cost <= filter.costAtMost) &&
    (filter.costAtLeast === undefined || card.cost >= filter.costAtLeast)
  );
}

function hasCostBound(filter: CardFilter): boolean {
  return filter.costAtMost !== undefined || filter.costAtLeast !== undefined;
}

/** Whether a filter matches every card: it names no type, subtype, or cost bound. */
export function matchesEveryCard(filter: CardFilter): boolean {
  return filter.cardType === undefined && filter.subtype === undefined && !hasCostBound(filter);
}

/**
 * Whether a played card's turn-log record matches a card filter: by the
 * type, subtype, "has all character types", and copiable cost it was played
 * with (RD-hv-7x4l.34-1), so a created card that has ceased to exist still
 * matches. A saved record without a cost reads its instance's copiable cost,
 * which never changes, and only for a filter with a cost bound.
 */
export function playedMatchesFilter(state: BattleState, catalog: EngineCatalog, played: PlayedCard, filter: CardFilter): boolean {
  const cost = played.cost ?? (hasCostBound(filter) ? copiableCostOf(state, catalog, played.instance) : 0);
  return matchesFilter({ cardType: played.cardType, subtype: played.subtype, allTypes: played.allTypes, cost }, filter);
}

/** The filter subject of the card `id`, with the characteristics `card` an evaluation gives it. */
export function filterSubjectOf(state: BattleState, catalog: EngineCatalog, id: InstanceId, card: Characteristics): FilterSubject {
  return { cardType: card.cardType, subtype: card.subtype, allTypes: card.allTypes, cost: copiableCostOf(state, catalog, id) };
}

/** Whether a card matches a card filter by its effective type and subtype and its copiable cost. */
export function cardMatchesFilter(state: BattleState, catalog: EngineCatalog, id: InstanceId, filter: CardFilter): boolean {
  if (state.instances[id] === undefined) return false;
  return matchesEveryCard(filter) || matchesFilter(filterSubjectOf(state, catalog, id, characteristicsOf(state, catalog, id)), filter);
}
