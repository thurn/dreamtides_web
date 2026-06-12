import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleSide } from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Live context passed to every builder. `state` is the committed state at the
 *  moment the step runs (post-previous-step). `random`/`nowMs` are injected so
 *  builders stay pure and testable (default to Math.random / Date.now at the
 *  call site). */
export interface StepContext {
  side: BattleSide;
  state: BattleMutableState;
  random: () => number;
  nowMs: number;
}

export type EffectPrompt =
  | {
      kind: "pick-cards";
      label: string;
      count: number;
      optional: boolean;
      candidates: (ctx: StepContext) => string[];
      resolve: (chosenIds: string[], ctx: StepContext) => BattleDebugEdit[];
    }
  | {
      kind: "choice";
      label: string;
      options: { label: string; build: (ctx: StepContext) => BattleDebugEdit[] }[];
    }
  | { kind: "confirm"; label: string; onYes: EffectStep[] }
  | { kind: "foresee"; count: number };

export type EffectStep =
  | { kind: "edits"; build: (ctx: StepContext) => BattleDebugEdit[] }
  | { kind: "prompt"; prompt: EffectPrompt };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Returns the opponent of `side`. */
export function opponentOf(side: BattleSide): BattleSide {
  return side === "player" ? "enemy" : "player";
}

/**
 * Returns ids from `side`'s void that are characters (`battleCardKind ===
 * "character"`). When `maxCost` is provided, only ids whose `energyCost <=
 * maxCost` are included. Ids with no backing card instance are skipped.
 */
export function charactersInVoid(
  state: BattleMutableState,
  side: BattleSide,
  maxCost?: number,
): string[] {
  return state.sides[side].void.filter((id) => {
    const instance = state.cardInstances[id];
    if (instance === undefined) return false;
    if (instance.definition.battleCardKind !== "character") return false;
    if (maxCost !== undefined && instance.definition.energyCost > maxCost) return false;
    return true;
  });
}

/**
 * Returns ids from `side`'s void that are events (`battleCardKind ===
 * "event"`). Ids with no backing card instance are skipped.
 */
export function eventsInVoid(
  state: BattleMutableState,
  side: BattleSide,
): string[] {
  return state.sides[side].void.filter((id) => {
    const instance = state.cardInstances[id];
    if (instance === undefined) return false;
    return instance.definition.battleCardKind === "event";
  });
}

/**
 * Returns the non-null slot occupant ids from the opponent's front and back
 * ranks. Does not include hand or void cards.
 */
export function enemyCharactersInPlay(
  state: BattleMutableState,
  side: BattleSide,
): string[] {
  return ranksOccupants(state, opponentOf(side));
}

/**
 * Returns the non-null slot occupant ids from `side`'s own front and back
 * ranks. Does not include hand or void cards.
 */
export function alliesInPlay(
  state: BattleMutableState,
  side: BattleSide,
): string[] {
  return ranksOccupants(state, side);
}

/**
 * Returns `max(0, target - hand.length)` `DRAW_CARD` edits for `side`, enough
 * to bring the hand up to `target` cards (does nothing if already at or above
 * target).
 */
export function drawUntilEdits(
  state: BattleMutableState,
  side: BattleSide,
  target: number,
): BattleDebugEdit[] {
  const deficit = Math.max(0, target - state.sides[side].hand.length);
  return drawEdits(side, deficit);
}

/**
 * Returns `count` `DRAW_CARD` edits for `side`. Use `drawUntilEdits` when you
 * want to draw up to a specific hand size.
 */
export function drawEdits(side: BattleSide, count: number): BattleDebugEdit[] {
  return Array.from({ length: count }, (): BattleDebugEdit => ({ kind: "DRAW_CARD", side }));
}

/** Returns an `ADJUST_CURRENT_ENERGY` edit of `+amount` for `side`. */
export function gainEnergyEdits(side: BattleSide, amount: number): BattleDebugEdit[] {
  return [{ kind: "ADJUST_CURRENT_ENERGY", side, amount }];
}

/** Returns an `ADJUST_SCORE` edit of `+amount` for `side`. */
export function gainScoreEdits(side: BattleSide, amount: number): BattleDebugEdit[] {
  return [{ kind: "ADJUST_SCORE", side, amount }];
}

/**
 * Returns the top `n` card ids from `side`'s deck (index 0 is the top). If
 * the deck has fewer than `n` cards, returns however many are available.
 */
export function topOfDeck(
  state: BattleMutableState,
  side: BattleSide,
  n: number,
): string[] {
  return state.sides[side].deck.slice(0, n);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Collects all non-null occupants from both rank zones for `side`. */
function ranksOccupants(state: BattleMutableState, side: BattleSide): string[] {
  const result: string[] = [];
  for (const slotId of BACK_RANK_SLOT_IDS) {
    const id = state.sides[side].backRank[slotId];
    if (id !== null) result.push(id);
  }
  for (const slotId of FRONT_RANK_SLOT_IDS) {
    const id = state.sides[side].frontRank[slotId];
    if (id !== null) result.push(id);
  }
  return result;
}
