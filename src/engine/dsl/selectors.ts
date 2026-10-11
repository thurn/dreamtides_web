import type { EngineCatalog } from "../catalog";
import { characteristics, copiableCostOf, type Characteristics } from "../continuous/characteristics";
import { hasKeyword } from "../rules/keywords";
import { charactersInPlay, slotOf } from "../rules/zones";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent, sourceInstance, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import type { BoundValue, CharacterSelector, PlayerRef, StackItemSelector } from "./types";

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
function sourceX(state: BattleState, source: AbilitySource): number {
  const id = sourceInstance(source);
  if (id === null) return 0;
  const instance = state.instances[id];
  if (instance?.zone === "play") return instance.status.x ?? 0;
  const item = state.stack.find((entry) => entry.kind === "card" && entry.instance === id);
  return item?.x ?? 0;
}

/** The number a selector bound stands for, for an effect of `source`. */
function boundOf(state: BattleState, bound: BoundValue, source: AbilitySource): number {
  return typeof bound === "number" ? bound : sourceX(state, source);
}

/** Whether a character in play matches the selector, for an effect controlled by `controller`. */
export function matchesCharacter(
  state: BattleState,
  catalog: EngineCatalog,
  selector: CharacterSelector,
  id: InstanceId,
  controller: Side,
  source: AbilitySource,
): boolean {
  return matchesCharacterWith(state, catalog, effective(state, catalog), selector, id, controller, source);
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
): boolean {
  const instance = state.instances[id];
  if (instance?.zone !== "play") return false;
  if (selector.controller === "you" && instance.controller !== controller) return false;
  if (selector.controller === "opponent" && instance.controller === controller) return false;
  if (selector.another === true && id === source) return false;
  if (selector.subtype !== undefined || selector.sparkAtMost !== undefined || selector.sparkAtLeast !== undefined) {
    const card = read(id);
    if (selector.subtype !== undefined && !card.allTypes && card.subtype !== selector.subtype) return false;
    // Spark is clamped at 0 for comparisons.
    const spark = card.spark ?? 0;
    if (selector.sparkAtMost !== undefined && spark > selector.sparkAtMost) return false;
    if (selector.sparkAtLeast !== undefined && spark < selector.sparkAtLeast) return false;
  }
  if (selector.costAtMost !== undefined || selector.costAtLeast !== undefined) {
    const cost = copiableCostOf(state, catalog, id);
    if (selector.costAtMost !== undefined && cost > boundOf(state, selector.costAtMost, source)) return false;
    if (selector.costAtLeast !== undefined && cost < boundOf(state, selector.costAtLeast, source)) return false;
  }
  // A figment copy is a figment (rules § Figments → Figment Copies).
  if (selector.figment !== undefined && (instance.printing.kind !== "card") !== selector.figment) return false;
  if (selector.exhausted !== undefined && instance.status.exhausted !== selector.exhausted) return false;
  if (selector.rank !== undefined && slotOf(state, id)?.rank !== selector.rank) return false;
  if (selector.challenging !== undefined && isChallenger(state, id) !== selector.challenging) return false;
  if (selector.blocking !== undefined && isBlocker(state, id) !== selector.blocking) return false;
  return true;
}

/**
 * Whether `id` is a challenger now (rules § Challengers, Blockers, and
 * Scoring → Holding a role): a character designated as a challenger this
 * turn that is in the active side's front rank, in any lane. It is the
 * character the Challenge phase resolves in that lane (`resolveLane`).
 */
function isChallenger(state: BattleState, id: InstanceId): boolean {
  const challenge = state.challenge;
  if (challenge === null || !challenge.challengers.includes(id)) return false;
  return state.sides[state.turn.active].frontRank.includes(id);
}

/**
 * Whether `id` is a blocker now: a character designated as a blocker this
 * turn that is in the defending side's front rank directly opposite a
 * challenger, the pairing `resolveLane` resolves.
 */
function isBlocker(state: BattleState, id: InstanceId): boolean {
  const challenge = state.challenge;
  if (challenge === null || !Object.values(challenge.blockers).includes(id)) return false;
  const active = state.turn.active;
  const lane = state.sides[opponent(active)].frontRank.indexOf(id);
  if (lane < 0) return false;
  const opposite = state.sides[active].frontRank[lane] ?? null;
  return opposite !== null && isChallenger(state, opposite);
}

/** Every matching character in play, in the fixed order: the controller's side first, B0→B9 then F0→F8. */
export function matchingCharacters(
  state: BattleState,
  catalog: EngineCatalog,
  selector: CharacterSelector,
  controller: Side,
  source: AbilitySource,
): InstanceId[] {
  return matchingCharactersWith(state, catalog, effective(state, catalog), selector, controller, source);
}

/** `matchingCharacters`, reading characteristics through `read`. */
export function matchingCharactersWith(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  selector: CharacterSelector,
  controller: Side,
  source: AbilitySource,
): InstanceId[] {
  const order = [controller, ...SIDES.filter((side) => side !== controller)];
  return order.flatMap((side) =>
    charactersInPlay(state, side).filter((id) =>
      matchesCharacterWith(state, catalog, read, selector, id, controller, source),
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
