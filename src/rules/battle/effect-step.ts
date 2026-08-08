import type { BattleDebugEdit } from "../../battle/debug/commands";
import type { BattleMutableState, BattleSide } from "../../battle/types";
import { rankSlotIds } from "../../battle/types";
import type { EffectBindings } from "./fold";
import type { FluentMessageDescriptor } from "../../data/localization-messages";

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
  /** The triggering card's `battleCardId`, when the effect resolves from a
   *  specific in-play character (Dawn/Materialized self-effects). Absent for
   *  side-scoped effects. */
  sourceId?: string;
  /** Plain trigger-edge facts captured before a source changed zones. */
  bindings?: EffectBindings;
  /** Candidate ids materialized when this prompt opened. */
  promptCandidateIds?: readonly string[];
  /** True while this step runs inside the scripted tutorial battle. Use only
   *  for a board-position preference in a specific guided teaching moment
   *  (e.g. centering a demonstrated figment instead of the documented
   *  leftmost-open default) — back-rank index is rules-bearing (it fixes
   *  which front-rank lanes a character supports, see battle_rules.md
   *  "Staggered positions and Support"), so a divergence here still changes
   *  what the tutorial teaches about board geometry, not just how it looks. */
  isTutorial?: boolean;
}

export type EffectPrompt =
  | {
      kind: "pick-cards";
      label: FluentMessageDescriptor;
      subtitle?: FluentMessageDescriptor;
      count: number;
      optional: boolean;
      candidates: (ctx: StepContext) => string[];
      resolve: (chosenIds: string[], ctx: StepContext) => BattleDebugEdit[];
      /**
       * Optional callout: ids among the candidates worth flagging in the picker,
       * e.g. the card just drawn by a preceding draw step so a "draw then
       * discard" effect makes it obvious which card is new. The picker badges
       * these; resolution is unaffected.
       */
      highlight?: (ctx: StepContext) => string[];
    }
  | {
      kind: "choice";
      label: FluentMessageDescriptor;
      options: {
        label: FluentMessageDescriptor;
        build: (ctx: StepContext) => BattleDebugEdit[];
      }[];
    }
  | { kind: "confirm"; label: FluentMessageDescriptor; onYes: EffectStep[] }
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

/** Returns a single `ERODE` edit of `count` for `side` (rules §Erode). */
export function erodeEdits(side: BattleSide, count: number): BattleDebugEdit[] {
  return [{ kind: "ERODE", side, count }];
}

/**
 * Returns a `SET_CARD_SPARK_DELTA` edit that adds `amount` of gained spark to
 * the instance's CURRENT `sparkDelta` (accumulates, does not overwrite). If the
 * instance is absent, returns `[]`.
 */
export function addGainedSparkEdits(
  battleCardId: string,
  amount: number,
  state: BattleMutableState,
): BattleDebugEdit[] {
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined) return [];
  return [{ kind: "SET_CARD_SPARK_DELTA", battleCardId, value: instance.sparkDelta + amount }];
}

/**
 * Returns one `DISCARD_CARD` edit per card currently in `side`'s hand, in hand
 * order. Returns `[]` for an empty hand. The discarded card's owner is implied
 * by its id, so the edit carries no `side` field.
 */
export function discardHandEdits(
  side: BattleSide,
  state: BattleMutableState,
): BattleDebugEdit[] {
  return state.sides[side].hand.map(
    (battleCardId): BattleDebugEdit => ({ kind: "DISCARD_CARD", battleCardId }),
  );
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
  for (const slotId of rankSlotIds(state.sides[side].backRank)) {
    const id = state.sides[side].backRank[slotId];
    if (id !== null) result.push(id);
  }
  for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
    const id = state.sides[side].frontRank[slotId];
    if (id !== null) result.push(id);
  }
  return result;
}
