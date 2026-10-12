import type { EngineCatalog } from "../catalog";
import { characteristics, copiableCostOf, filterSubjectOf, matchesEveryCard, matchesFilter, type Characteristics } from "../continuous/characteristics";
import { challengeRoleOf } from "../rules/challenge";
import { hasKeyword } from "../rules/keywords";
import { charactersInPlay, slotOf } from "../rules/zones";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent, sourceInstance, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import type { BoundValue, CardCountValue, CharacterSelector, PlayerRef, StackItemSelector } from "./types";

/**
 * Reads the characteristics a selector compares: the effective ones for
 * rules code, or those of earlier layers inside the layer evaluation.
 */
export type CharacteristicsReader = (id: InstanceId) => Characteristics;

function effective(state: BattleState, catalog: EngineCatalog): CharacteristicsReader {
  const layers = characteristics(state, catalog);
  return (id) => layers.of(id);
}

export function resolvePlayer(controller: Side, ref: PlayerRef): Side {
  return ref === "you" ? controller : opponent(controller);
}

/**
 * The X paid for a source card (RD-hv-umm2.66-1): its stack item's X while
 * it is on the stack, the X it keeps while it is in play, and 0 otherwise.
 */
export function sourceX(state: BattleState, source: AbilitySource): number {
  const id = sourceInstance(source);
  if (id === null) return 0;
  const instance = state.instances[id];
  if (instance?.zone === "play") return instance.status.x ?? 0;
  const item = state.stack.find((entry) => entry.kind === "card" && entry.instance === id);
  return item?.x ?? 0;
}

/**
 * How many cards a zone count names now, for an effect controlled by
 * `controller` (RD-hv-umm2.76-1): every card there, or in a void those
 * whose characteristics, read through `read`, and copiable cost match.
 */
export function zoneCountWith(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  count: CardCountValue,
  controller: Side,
): number {
  const cards = state.sides[resolvePlayer(controller, count.player)][count.zone];
  const filter = count.filter;
  if (filter === undefined || matchesEveryCard(filter)) return cards.length;
  return cards.filter((id) => matchesFilter(filterSubjectOf(state, catalog, id, read(id)), filter)).length;
}

/** `zoneCountWith`, reading effective characteristics. */
export function zoneCount(state: BattleState, catalog: EngineCatalog, count: CardCountValue, controller: Side): number {
  return zoneCountWith(state, catalog, effective(state, catalog), count, controller);
}

/**
 * A selector bound now: a constant; for X, an explicit play-preparation X,
 * otherwise the source card's X; or a zone count, read through `read`.
 */
function boundOf(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  bound: BoundValue,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
): number {
  if (typeof bound === "number") return bound;
  if (bound.value === "x") return selectorX ?? sourceX(state, source);
  return zoneCountWith(state, catalog, read, bound, controller);
}

/** Whether a character in play matches the selector, for an effect controlled by `controller`. */
export function matchesCharacter(
  state: BattleState,
  catalog: EngineCatalog,
  selector: CharacterSelector,
  id: InstanceId,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
): boolean {
  return matchesCharacterWith(state, catalog, effective(state, catalog), selector, id, controller, source, selectorX);
}

/** `matchesCharacter`, reading characteristics through `read`. */
export function matchesCharacterWith(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  selector: CharacterSelector,
  id: InstanceId,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
): boolean {
  const instance = state.instances[id];
  if (instance?.zone !== "play") return false;
  if (selector.controller === "you" && instance.controller !== controller) return false;
  if (selector.controller === "opponent" && instance.controller === controller) return false;
  if (selector.another === true && id === source) return false;
  const bound = (value: BoundValue): number => boundOf(state, catalog, read, value, controller, source, selectorX);
  if (selector.subtype !== undefined || selector.notSubtype !== undefined || selector.sparkAtMost !== undefined || selector.sparkAtLeast !== undefined) {
    const card = read(id);
    if (selector.subtype !== undefined && !card.allTypes && card.subtype !== selector.subtype) return false;
    // A character with all character types is of every type, the excluded one included.
    if (selector.notSubtype !== undefined && (card.allTypes || card.subtype === selector.notSubtype)) return false;
    // Spark is clamped at 0 for comparisons.
    const spark = card.spark ?? 0;
    if (selector.sparkAtMost !== undefined && spark > bound(selector.sparkAtMost)) return false;
    if (selector.sparkAtLeast !== undefined && spark < bound(selector.sparkAtLeast)) return false;
  }
  if (selector.costAtMost !== undefined || selector.costAtLeast !== undefined) {
    const cost = copiableCostOf(state, catalog, id);
    if (selector.costAtMost !== undefined && cost > bound(selector.costAtMost)) return false;
    if (selector.costAtLeast !== undefined && cost < bound(selector.costAtLeast)) return false;
  }
  // A figment copy is a figment (rules § Figments → Figment Copies).
  if (selector.figment !== undefined && (instance.printing.kind !== "card") !== selector.figment) return false;
  if (selector.exhausted !== undefined && instance.status.exhausted !== selector.exhausted) return false;
  if (selector.rank !== undefined && slotOf(state, id)?.rank !== selector.rank) return false;
  // Roles are the pairs the Challenge phase resolves (rules § Challengers, Blockers, and Scoring → Holding a role).
  if (selector.challenging !== undefined || selector.blocking !== undefined) {
    const role = challengeRoleOf(state, id);
    if (selector.challenging !== undefined && (role === "challenger") !== selector.challenging) return false;
    if (selector.blocking !== undefined && (role === "blocker") !== selector.blocking) return false;
  }
  return true;
}

/** Every matching character in play, in the fixed order: the controller's side first, B0→B9 then F0→F8. */
export function matchingCharacters(
  state: BattleState,
  catalog: EngineCatalog,
  selector: CharacterSelector,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
): InstanceId[] {
  return matchingCharactersWith(state, catalog, effective(state, catalog), selector, controller, source, selectorX);
}

/** `matchingCharacters`, reading characteristics through `read`. */
export function matchingCharactersWith(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  selector: CharacterSelector,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
): InstanceId[] {
  const order = [controller, ...SIDES.filter((side) => side !== controller)];
  return order.flatMap((side) =>
    charactersInPlay(state, side).filter((id) =>
      matchesCharacterWith(state, catalog, read, selector, id, controller, source, selectorX),
    ),
  );
}

/**
 * Whether the card `id` is on the stack and matches the selector, for an
 * effect controlled by `controller`. An item never matches its own effect.
 */
export function matchesStackItem(
  state: BattleState,
  catalog: EngineCatalog,
  selector: StackItemSelector,
  id: InstanceId,
  controller: Side,
  source: AbilitySource,
): boolean {
  if (id === source) return false;
  const item = state.stack.find((entry) => entry.kind === "card" && entry.instance === id);
  if (item === undefined) return false;
  if (selector.controller === "you" && item.controller !== controller) return false;
  if (selector.controller === "opponent" && item.controller === controller) return false;
  if (selector.cardType !== undefined && characteristics(state, catalog).of(id).cardType !== selector.cardType) return false;
  if (selector.preventable === true && hasKeyword(state, catalog, id, "cannotBePrevented")) return false;
  return true;
}

/** Every matching card on the stack, top first. */
export function matchingStackItems(
  state: BattleState,
  catalog: EngineCatalog,
  selector: StackItemSelector,
  controller: Side,
  source: AbilitySource,
): InstanceId[] {
  return state.stack
    .flatMap((item) => (item.kind === "card" ? [item.instance] : []))
    .reverse()
    .filter((id) => matchesStackItem(state, catalog, selector, id, controller, source));
}
