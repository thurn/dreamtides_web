import type { EngineCatalog } from "../catalog";
import { characteristicsOf } from "../continuous/characteristics";
import { costModifier } from "../continuous/costs";
import type { Speed } from "../dsl/types";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { costsPayable, playCosts } from "./costs";
import { instanceOf, openBackSlots } from "./zones";

/** Whether `side` has a Fast window now: its own Day or Night, or the opponent's Dusk. */
export function hasFastWindow(state: BattleState, side: Side): boolean {
  const { active, phase } = state.turn;
  return side === active ? phase === "day" || phase === "night" : phase === "dusk";
}

/**
 * Whether the timing rules let `side` play a card or activate an ability of
 * this speed now (rules § Playing Cards and the Stack). Cards and activated
 * abilities share these rules.
 */
export function timingAllows(state: BattleState, side: Side, speed: Speed): boolean {
  if (state.stack.length === 0) {
    if (speed === "standard") {
      return side === state.turn.active && state.turn.phase === "day";
    }
    // Fast, and Interrupt as a kind of Fast.
    return hasFastWindow(state, side);
  }
  // Only an Interrupt can be played onto a non-empty stack, as a response to
  // the opponent's item by the side holding priority.
  const top = state.stack[state.stack.length - 1];
  return (
    speed === "interrupt" &&
    state.priority === side &&
    top !== undefined &&
    top.controller === opponent(side)
  );
}

/**
 * Whether `side` may take a special action that is available wherever it
 * could play a Fast card but never as a response, such as `payToEnd` (C7).
 */
export function specialActionAllowed(state: BattleState, side: Side): boolean {
  return state.stack.length === 0 && hasFastWindow(state, side);
}

/**
 * Back-rank positions still free for `side` once the characters it already
 * has on the stack resolve. A side whose back rank would be full cannot play
 * another character (rules § Battlefield Capacity).
 */
export function freeBackSlotsAfterStack(state: BattleState, catalog: EngineCatalog, side: Side): number {
  const pending = state.stack.filter(
    (item) =>
      item.kind === "card" &&
      item.controller === side &&
      characteristicsOf(state, catalog, item.instance).cardType === "character",
  ).length;
  return openBackSlots(state, side) - pending;
}

/** Whether `side` may play the card `id` from its hand now: a card in its hand, even one the opponent owns. */
export function canPlayFromHand(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  id: InstanceId,
): boolean {
  const instance = instanceOf(state, id);
  if (instance.zone !== "hand" || instance.controller !== side) {
    return false;
  }
  const definition = catalog.card(instance.cardId);
  if (!timingAllows(state, side, definition.speed)) {
    return false;
  }
  // An X cost needs its minimum X, after cost modifications; the play's prompts check the cost choices.
  if (!costsPayable(state, side, id, playCosts(definition, instance.variant), costModifier(state, catalog, id, side))) {
    return false;
  }
  return (
    characteristicsOf(state, catalog, id).cardType !== "character" || freeBackSlotsAfterStack(state, catalog, side) > 0
  );
}
