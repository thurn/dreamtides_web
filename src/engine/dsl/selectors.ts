import type { EngineCatalog } from "../catalog";
import { hasKeyword } from "../rules/keywords";
import { effectiveSpark } from "../rules/spark";
import { charactersInPlay, instanceOf, slotOf } from "../rules/zones";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import type { CharacterSelector, PlayerRef, StackItemSelector } from "./types";

export function resolvePlayer(controller: Side, ref: PlayerRef): Side {
  return ref === "you" ? controller : opponent(controller);
}

/** A character's cost for cost selectors; an X-cost card counts as 0. */
function costOf(state: BattleState, catalog: EngineCatalog, id: InstanceId): number {
  return catalog.card(instanceOf(state, id).cardId).cost ?? 0;
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
  const instance = state.instances[id];
  if (instance?.zone !== "play") return false;
  if (selector.controller === "you" && instance.controller !== controller) return false;
  if (selector.controller === "opponent" && instance.controller === controller) return false;
  if (selector.another === true && id === source) return false;
  const definition = catalog.card(instance.cardId);
  if (selector.subtype !== undefined && definition.subtype !== selector.subtype) return false;
  const spark = effectiveSpark(state, catalog, id);
  if (selector.sparkAtMost !== undefined && spark > selector.sparkAtMost) return false;
  if (selector.sparkAtLeast !== undefined && spark < selector.sparkAtLeast) return false;
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
  const order = [controller, ...SIDES.filter((side) => side !== controller)];
  return order.flatMap((side) =>
    charactersInPlay(state, side).filter((id) =>
      matchesCharacter(state, catalog, selector, id, controller, source),
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
  const definition = catalog.card(instanceOf(state, id).cardId);
  if (selector.cardType !== undefined && definition.cardType !== selector.cardType) return false;
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
