import type { EngineCatalog } from "../catalog";
import type { Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import type { Action, Decision } from "./actions";
import { legalMoves, type LegalityMemo } from "./legality";
import { legalRepositionSlots } from "./reposition";
import { payableNow } from "./payable";
import { charactersInPlay } from "./zones";

/** The side that acts in the current main window, or `null` outside Day, Dusk, and Night. */
export function mainWindowSide(state: BattleState): Side | null {
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
  for (const card of charactersInPlay(state, side)) {
    actions.push(...legalRepositionSlots(state, card).map((to): Action => ({ kind: "reposition", card, to })));
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
  if (state.result !== null || state.triggerQueue.length > 0 || state.loops.run !== null) {
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
    ...loopOffer(state, side),
  ];
}

/** The `repeatLoop` action for the loop on offer to `side`, if any. */
function loopOffer(state: BattleState, side: Side): Action[] {
  const candidate = state.loops.candidate;
  return candidate?.side === side ? [{ kind: "repeatLoop", loop: candidate.id, count: "untilVictory" }] : [];
}

/**
 * The pending top-level decision, derived from the state. A side holding
 * priority with no legal response has no decision: it passes automatically
 * (P1). Nobody decides while triggers wait to resolve (D14) or while an
 * accepted loop repeats.
 */
export function decision(
  state: BattleState,
  catalog: EngineCatalog,
  memo: LegalityMemo,
): Decision | null {
  if (state.result !== null || state.triggerQueue.length > 0 || state.loops.run !== null) {
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
