import { instanceCard, type EngineCatalog } from "../catalog";
import { characteristics, type Characteristics } from "../continuous/characteristics";
import { fixedEnergy } from "./energy";
import { hasKeyword } from "../rules/keywords";
import { charactersInPlay, instanceOf, slotOf } from "../rules/zones";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import type { CharacterSelector, PlayerRef, StackItemSelector } from "./types";

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
 * A character's cost for cost selectors: its fixed energy, with X counting
 * as 0. Cost selectors read the copiable cost (C4): 0● for a figment, the
 * copied cost for a figment copy (C13). Cost modifications apply only to
 * playing a card.
 */
function costOf(state: BattleState, catalog: EngineCatalog, id: InstanceId): number {
  return fixedEnergy(instanceCard(catalog, instanceOf(state, id)).costs);
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
  if (selector.costAtMost !== undefined && costOf(state, catalog, id) > selector.costAtMost) return false;
  if (selector.exhausted !== undefined && instance.status.exhausted !== selector.exhausted) return false;
  if (selector.rank !== undefined && slotOf(state, id)?.rank !== selector.rank) return false;
  return true;
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
