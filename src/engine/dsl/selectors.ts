import type { EngineCatalog } from "../catalog";
import { characteristics, copiableCostOf, filterSubjectOf, matchesEveryCard, matchesFilter, type Characteristics } from "../continuous/characteristics";
import { challengeRoleOf } from "../rules/challenge";
import { hasKeyword } from "../rules/keywords";
import { charactersInPlay, slotOf } from "../rules/zones";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent, sourceInstance, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import type { BoundValue, VoidCostBound, CardCountValue, CharacterSelector, PlayerRef, StackItemSelector } from "./types";

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
 * Reads "this character's ✦" for an ability choosing its targets or
 * resolving (rules § Spark → This character's ✦): the source's current
 * effective spark while it is in play, else the spark retained when it left
 * play, else 0. Where nothing resolves, as in a static ability or the layer
 * evaluation, there is no reader.
 */
export type SourceSparkReader = () => number;

/**
 * A selector bound now: a constant; for X, an explicit preparation or
 * resolving binding, otherwise the source card's stored X; a zone count,
 * read through `read`; or the
 * source's ✦ through `sourceSpark`, which throws without a reader.
 */
function boundOf(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  bound: VoidCostBound,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
  sourceSpark?: SourceSparkReader,
  subjectCost?: number | null,
): number {
  if (typeof bound === "number") return bound;
  switch (bound.value) {
    case "x":
      return selectorX ?? sourceX(state, source);
    case "countCards":
      return zoneCountWith(state, catalog, read, bound, controller);
    case "subjectCost":
      if (subjectCost === undefined) throw new Error("A static ability cannot read a triggering subject cost");
      return subjectCost ?? 0;
    case "sourceSpark":
      if (sourceSpark === undefined) throw new Error("A static ability cannot read this character's ✦");
      return sourceSpark();
  }
}

/** `boundOf`, reading effective characteristics: a void target's cost bound. */
export function boundNow(
  state: BattleState,
  catalog: EngineCatalog,
  bound: VoidCostBound,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
  sourceSpark?: SourceSparkReader,
  subjectCost?: number | null,
): number {
  return boundOf(state, catalog, (id) => characteristics(state, catalog).of(id), bound, controller, source, selectorX, sourceSpark, subjectCost);
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
  sourceSpark?: SourceSparkReader,
): boolean {
  return matchesCharacterWith(state, catalog, effective(state, catalog), selector, id, controller, source, selectorX, sourceSpark);
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
  sourceSpark?: SourceSparkReader,
): boolean {
  const instance = state.instances[id];
  if (instance?.zone !== "play") return false;
  if (selector.controller === "you" && instance.controller !== controller) return false;
  if (selector.controller === "opponent" && instance.controller === controller) return false;
  const bound = (value: BoundValue): number => boundOf(state, catalog, read, value, controller, source, selectorX, sourceSpark);
  const matchesLeaf = (predicate: Omit<CharacterSelector, "controller" | "anyOf">): boolean => {
    if (predicate.another === true && id === source) return false;
    if (predicate.subtype !== undefined || predicate.notSubtype !== undefined || predicate.sparkAtMost !== undefined || predicate.sparkAtLeast !== undefined) {
      const card = read(id);
      if (predicate.subtype !== undefined && !card.allTypes && card.subtype !== predicate.subtype) return false;
      // A character with all character types is of every type, the excluded one included.
      if (predicate.notSubtype !== undefined && (card.allTypes || card.subtype === predicate.notSubtype)) return false;
      // Spark is clamped at 0 for comparisons.
      const spark = card.spark ?? 0;
      if (predicate.sparkAtMost !== undefined && spark > bound(predicate.sparkAtMost)) return false;
      if (predicate.sparkAtLeast !== undefined && spark < bound(predicate.sparkAtLeast)) return false;
    }
    if (predicate.costAtMost !== undefined || predicate.costAtLeast !== undefined) {
      const cost = copiableCostOf(state, catalog, id);
      if (predicate.costAtMost !== undefined && cost > bound(predicate.costAtMost)) return false;
      if (predicate.costAtLeast !== undefined && cost < bound(predicate.costAtLeast)) return false;
    }
    // A figment copy is a figment (rules § Figments → Figment Copies).
    if (predicate.figment !== undefined && (instance.printing.kind !== "card") !== predicate.figment) return false;
    if (predicate.exhausted !== undefined && instance.status.exhausted !== predicate.exhausted) return false;
    if (predicate.rank !== undefined && slotOf(state, id)?.rank !== predicate.rank) return false;
    // Roles are the pairs the Challenge phase resolves (rules § Challengers, Blockers, and Scoring → Holding a role).
    if (predicate.challenging !== undefined || predicate.blocking !== undefined) {
      const role = challengeRoleOf(state, id);
      if (predicate.challenging !== undefined && (role === "challenger") !== predicate.challenging) return false;
      if (predicate.blocking !== undefined && (role === "blocker") !== predicate.blocking) return false;
    }
    return true;
  };
  return matchesLeaf(selector) && (selector.anyOf === undefined || selector.anyOf.some(matchesLeaf));
}

/** Every matching character in play, in the fixed order: the controller's side first, B0→B9 then F0→F8. */
export function matchingCharacters(
  state: BattleState,
  catalog: EngineCatalog,
  selector: CharacterSelector,
  controller: Side,
  source: AbilitySource,
  selectorX?: number,
  sourceSpark?: SourceSparkReader,
): InstanceId[] {
  return matchingCharactersWith(state, catalog, effective(state, catalog), selector, controller, source, selectorX, sourceSpark);
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
  sourceSpark?: SourceSparkReader,
): InstanceId[] {
  const order = [controller, ...SIDES.filter((side) => side !== controller)];
  return order.flatMap((side) =>
    charactersInPlay(state, side).filter((id) =>
      matchesCharacterWith(state, catalog, read, selector, id, controller, source, selectorX, sourceSpark),
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
  if (selector.costAtMost !== undefined && copiableCostOf(state, catalog, id) > selector.costAtMost) return false;
  if (selector.sparkAtMost !== undefined) {
    const spark = characteristics(state, catalog).of(id).spark;
    if (spark === null || spark > selector.sparkAtMost) return false;
  }
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
