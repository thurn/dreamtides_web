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
import type { CardFilter, NamedTrigger, Speed } from "../dsl/types";
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

/**
 * What a card filter compares: a card's type, subtype, and "has all
 * character types", its named triggered abilities, copiable speed and cost, and effective spark in its
 * current zone (`null` for an event).
 */
export interface FilterSubject extends Pick<Characteristics, "cardType" | "subtype" | "allTypes" | "spark"> {
  readonly cost: number;
  /** Effective named triggers; absent when historical abilities are unknown. */
  readonly namedTriggers?: readonly NamedTrigger[];
  /** Copiable speed; absent only when historical speed is unknown. */
  readonly speed?: Speed;
}

/**
 * Whether a card matches a card filter: named ability presence; Fast speed (Interrupt included); type; subtype, unless the card has
 * all types; copiable cost within the cost bounds; and effective spark
 * within the ✦ bounds, which a card with no spark never meets. A played
 * card's turn-log record matches the same way.
 */
export function matchesFilter(card: FilterSubject, filter: CardFilter): boolean {
  return (
    (filter.hasAbility === undefined || card.namedTriggers?.includes(filter.hasAbility) === true) &&
    (filter.fast === undefined || card.speed === "fast" || card.speed === "interrupt") &&
    (filter.cardType === undefined || card.cardType === filter.cardType) &&
    (filter.subtype === undefined || card.allTypes || card.subtype === filter.subtype) &&
    (filter.costAtMost === undefined || card.cost <= filter.costAtMost) &&
    (filter.costAtLeast === undefined || card.cost >= filter.costAtLeast) &&
    (filter.sparkAtMost === undefined || (card.spark !== null && card.spark <= filter.sparkAtMost)) &&
    (filter.sparkAtLeast === undefined || (card.spark !== null && card.spark >= filter.sparkAtLeast))
  );
}

function hasCostBound(filter: CardFilter): boolean {
  return filter.costAtMost !== undefined || filter.costAtLeast !== undefined;
}

function hasSparkBound(filter: CardFilter): boolean {
  return filter.sparkAtMost !== undefined || filter.sparkAtLeast !== undefined;
}

/** Whether a filter matches every card: it names no ability, speed, type, subtype, cost bound, or ✦ bound. */
export function matchesEveryCard(filter: CardFilter): boolean {
  return filter.hasAbility === undefined && filter.fast === undefined && filter.cardType === undefined && filter.subtype === undefined && !hasCostBound(filter) && !hasSparkBound(filter);
}

/**
 * Whether a played card's turn-log record matches a card filter: by the
 * type, subtype, "has all character types", copiable speed and cost, and effective
 * spark it was played with (RD-hv-7x4l.34-1, RD-hv-umm2.464-1), so a card
 * that has ceased to exist, or that no determinization can identify in a
 * hidden zone, still matches. A saved record without a cost or a spark reads
 * its instance's copiable cost, which never changes, or current spark, and
 * only for a filter with that bound. When that instance has ceased, an
 * unknown historical cost or spark matches no such bound. Missing historical
 * speed matches no Fast filter, even when the instance still exists. Missing
 * historical named abilities match no ability filter; current abilities are
 * not evidence of historical presence.
 */
export function playedMatchesFilter(state: BattleState, catalog: EngineCatalog, played: PlayedCard, filter: CardFilter): boolean {
  const exists = state.instances[played.instance] !== undefined;
  const unknown = (bounded: boolean, recorded: unknown) => bounded && recorded === undefined && !exists;
  if (unknown(hasCostBound(filter), played.cost) || unknown(hasSparkBound(filter), played.spark)) return false;
  const cost = played.cost ?? (hasCostBound(filter) ? copiableCostOf(state, catalog, played.instance) : 0);
  const spark = played.spark !== undefined ? played.spark : hasSparkBound(filter) ? characteristicsOf(state, catalog, played.instance).spark : null;
  return matchesFilter({ cardType: played.cardType, subtype: played.subtype, allTypes: played.allTypes, cost, spark, speed: played.speed, namedTriggers: played.namedTriggers }, filter);
}

/** The filter subject of the card `id`, with the characteristics `card` an evaluation gives it. */
export function filterSubjectOf(state: BattleState, catalog: EngineCatalog, id: InstanceId, card: Characteristics): FilterSubject {
  return { cardType: card.cardType, subtype: card.subtype, allTypes: card.allTypes, spark: card.spark, namedTriggers: card.namedTriggers, cost: copiableCostOf(state, catalog, id), speed: instanceCard(catalog, state.instances[id]).speed };
}

/** Whether a card matches a card filter by its effective type, subtype, and spark and its copiable speed and cost. */
export function cardMatchesFilter(state: BattleState, catalog: EngineCatalog, id: InstanceId, filter: CardFilter): boolean {
  if (state.instances[id] === undefined) return false;
  return matchesEveryCard(filter) || matchesFilter(filterSubjectOf(state, catalog, id, characteristicsOf(state, catalog, id)), filter);
}
