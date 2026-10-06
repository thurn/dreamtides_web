import type { EngineCatalog } from "../catalog";
import type { Side, Slot } from "../state/ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import type { Action, Decision } from "./actions";
import { legalMoves, type LegalityMemo } from "./legality";
import { mergeable } from "./figments";
import { payableNow } from "./payable";
import { charactersInPlay, instanceOf, occupant, slotOf } from "./zones";

/** The side that acts in the current main window, or `null` outside Day, Dusk, and Night. */
function mainWindowSide(state: BattleState): Side | null {
  switch (state.turn.phase) {
    case "day":
    case "night":
      return state.turn.active;
    case "dusk":
      return opponent(state.turn.active);
    default:
      return null;
  }
}

/** Whether `side` may reposition now: its own Day, or the opponent's Dusk. */
function canReposition(state: BattleState, side: Side): boolean {
  if (state.stack.length > 0) {
    return false;
  }
  const { active, phase } = state.turn;
  return side === active ? phase === "day" : phase === "dusk";
}

function legalRepositions(state: BattleState, side: Side): Action[] {
  if (!canReposition(state, side)) {
    return [];
  }
  const actions: Action[] = [];
  const slots: Slot[] = [
    ...Array.from({ length: BACK_RANK_SIZE }, (_, index): Slot => ({ rank: "back", index })),
    ...Array.from({ length: FRONT_RANK_SIZE }, (_, index): Slot => ({ rank: "front", index })),
  ];
  for (const card of charactersInPlay(state, side)) {
    const from = slotOf(state, card);
    if (from === null) {
      continue;
    }
    const exhausted = instanceOf(state, card).status.exhausted;
    for (const to of slots) {
      if (to.rank === from.rank && to.index === from.index) {
        continue;
      }
      const other = occupant(state, side, to);
      if (other !== null && mergeable(state, card, other)) {
        // A merge, legal only between two exhausted figments or two ready ones.
        if (exhausted === instanceOf(state, other).status.exhausted) actions.push({ kind: "reposition", card, to });
        continue;
      }
      // An exhausted character cannot be moved to the front rank, by either
      // half of a swap.
      if (exhausted && to.rank === "front") {
        continue;
      }
      if (other !== null && from.rank === "front" && instanceOf(state, other).status.exhausted) {
        continue;
      }
      actions.push({ kind: "reposition", card, to });
    }
  }
  return actions;
}

/** The plays and activations `side` may make now: its responses while the stack is non-empty. */
function stackActions(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  memo: LegalityMemo,
): Action[] {
  const { plays, activations } = legalMoves(state, catalog, side, memo);
  return [
    ...plays.map(({ card, from }): Action => ({ kind: "play", card, from })),
    ...activations.map((activation): Action => ({ kind: "activate", ...activation })),
  ];
}

/**
 * Every action `side` may take now, `pass` first. Empty unless `side` owns
 * the pending decision.
 */
export function legalActions(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  memo: LegalityMemo,
): Action[] {
  if (state.result !== null || state.triggerQueue.length > 0) {
    return [];
  }
  if (state.stack.length > 0) {
    if (state.priority !== side) {
      return [];
    }
    return [{ kind: "pass" }, ...stackActions(state, catalog, side, memo)];
  }
  if (mainWindowSide(state) !== side) {
    return [];
  }
  return [
    { kind: "pass" },
    ...stackActions(state, catalog, side, memo),
    ...legalRepositions(state, side),
    ...payableNow(state, side).map((effect): Action => ({ kind: "payToEnd", effect: effect.id })),
  ];
}

/**
 * The pending top-level decision, derived from the state. A side holding
 * priority with no legal response has no decision: it passes automatically
 * (P1). Nobody decides while triggers wait to resolve (D14).
 */
export function decision(
  state: BattleState,
  catalog: EngineCatalog,
  memo: LegalityMemo,
): Decision | null {
  if (state.result !== null || state.triggerQueue.length > 0) {
    return null;
  }
  if (state.stack.length > 0) {
    const side = state.priority;
    if (side === null || stackActions(state, catalog, side, memo).length === 0) {
      return null;
    }
    return { kind: "respond", side };
  }
  const side = mainWindowSide(state);
  return side === null ? null : { kind: "main", side };
}
