import type { EngineCatalog, EngineCardDefinition } from "../catalog";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { instanceOf, openBackSlots } from "./zones";

/** Whether `side` has a Fast window now: its own Day or Night, or the opponent's Dusk. */
export function hasFastWindow(state: BattleState, side: Side): boolean {
  const { active, phase } = state.turn;
  return side === active ? phase === "day" || phase === "night" : phase === "dusk";
}

/** Whether the timing rules let `side` play a card of this definition now. */
export function timingAllows(
  state: BattleState,
  side: Side,
  definition: EngineCardDefinition,
): boolean {
  if (state.stack.length === 0) {
    if (definition.speed === "standard") {
      return side === state.turn.active && state.turn.phase === "day";
    }
    return hasFastWindow(state, side);
  }
  // Only an Interrupt can be played onto a non-empty stack, as a response to
  // the opponent's item by the side holding priority.
  const top = state.stack[state.stack.length - 1];
  return (
    definition.speed === "interrupt" &&
    state.priority === side &&
    top !== undefined &&
    top.controller === opponent(side)
  );
}

/**
 * Back-rank positions still free for `side` once the characters it already
 * has on the stack resolve. A side whose back rank would be full cannot play
 * another character (rules § Battlefield Capacity).
 */
export function freeBackSlotsAfterStack(state: BattleState, catalog: EngineCatalog, side: Side): number {
  const pending = state.stack.filter(
    (item) =>
      item.controller === side &&
      catalog.card(instanceOf(state, item.instance).cardId).cardType === "character",
  ).length;
  return openBackSlots(state, side) - pending;
}

/** Whether `side` may play the card `id` from its hand now. */
export function canPlayFromHand(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  id: InstanceId,
): boolean {
  const instance = instanceOf(state, id);
  if (instance.zone !== "hand" || instance.owner !== side) {
    return false;
  }
  const definition = catalog.card(instance.cardId);
  if (!timingAllows(state, side, definition)) {
    return false;
  }
  // X costs need a prompt for the value of X, which this engine does not raise yet.
  if (definition.cost === null || definition.cost > state.sides[side].currentEnergy) {
    return false;
  }
  return (
    definition.cardType !== "character" || freeBackSlotsAfterStack(state, catalog, side) > 0
  );
}
