import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleResult, BattleSide } from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import { energyRampEdits } from "./energy";

export interface HandoffInput {
  state: BattleMutableState;
  scoreToWin: number;   // BattleInit.scoreToWin === 25
  turnLimit: number;    // BattleInit.turnLimit === 50
  maxEnergyCap: number; // 10
}

export interface HandoffPlan {
  result: BattleResult | null;        // "victory"|"defeat"|"draw"|null, from the PLAYER's POV
  /**
   * Ending bookend for the OUTGOING side: its ephemeral hand cards and offering
   * in-play cards are banished (rules §Turn Structure — Ending). Applied before
   * the side flip.
   */
  endingBanishEdits: BattleDebugEdit[];
  flowEdit: BattleDebugEdit;          // SET_BATTLE_FLOW{phase:"day", activeSide, turnNumber}
  /**
   * Dawn bookend for the INCOMING side: every in-play character it controls
   * loses the exhausted status (rules §Dawn). Applied after the side flip,
   * alongside the incoming side's ramp and draw.
   */
  dawnClearEdits: BattleDebugEdit[];
  drawEdits: BattleDebugEdit[];       // DRAW_CARD for the next side (empty on the very first turn)
  energyEdits: BattleDebugEdit[];     // energyRampEdits for the next side
}

/**
 * Ending: banishes `side`'s ephemeral hand cards and offering in-play cards
 * (rules §Turn Structure — Ending). Emits a `MOVE_CARD_TO_ZONE` to the banished
 * zone only for cards that carry the matching status.
 */
export function endingBanishEdits(
  state: BattleMutableState,
  side: BattleSide,
): BattleDebugEdit[] {
  const edits: BattleDebugEdit[] = [];
  const sideState = state.sides[side];

  for (const battleCardId of sideState.hand) {
    appendBanishEdit(state, side, battleCardId, "ephemeral", edits);
  }
  for (const slotId of BACK_RANK_SLOT_IDS) {
    appendBanishEdit(state, side, sideState.backRank[slotId], "offering", edits);
  }
  for (const slotId of FRONT_RANK_SLOT_IDS) {
    appendBanishEdit(state, side, sideState.frontRank[slotId], "offering", edits);
  }

  return edits;
}

function appendBanishEdit(
  state: BattleMutableState,
  side: BattleSide,
  battleCardId: string | null,
  statusKey: "ephemeral" | "offering",
  edits: BattleDebugEdit[],
): void {
  if (battleCardId === null) {
    return;
  }
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined || !instance.status[statusKey]) {
    return;
  }
  edits.push({
    kind: "MOVE_CARD_TO_ZONE",
    battleCardId,
    destination: { side, zone: "banished" },
  });
}

/**
 * Dawn: clears the exhausted status from every in-play character (front or back
 * rank) of `side` (rules §Dawn). Emits a `SET_CARD_STATUS` clear only for
 * characters that are currently exhausted, so a board with nothing to wake
 * produces no edits.
 */
export function dawnClearEdits(
  state: BattleMutableState,
  side: BattleSide,
): BattleDebugEdit[] {
  const edits: BattleDebugEdit[] = [];
  const sideState = state.sides[side];

  for (const slotId of BACK_RANK_SLOT_IDS) {
    appendExhaustClearEdit(state, sideState.backRank[slotId], edits);
  }
  for (const slotId of FRONT_RANK_SLOT_IDS) {
    appendExhaustClearEdit(state, sideState.frontRank[slotId], edits);
  }

  return edits;
}

function appendExhaustClearEdit(
  state: BattleMutableState,
  battleCardId: string | null,
  edits: BattleDebugEdit[],
): void {
  if (battleCardId === null) {
    return;
  }
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined || !instance.status.isExhausted) {
    return;
  }
  edits.push({
    kind: "SET_CARD_STATUS",
    battleCardId,
    status: { isExhausted: false },
  });
}

/**
 * Advance (activeSide, turnNumber) to the next turn-pair position.
 *
 * Source of truth: `advanceBattleTurnPair` in
 * `src/battle/components/PlayableBattleScreen.tsx` (~line 1454).
 * Rule: player → enemy keeps turnNumber; enemy → player increments turnNumber.
 */
function advanceTurnPair(
  activeSide: BattleSide,
  turnNumber: number,
): { activeSide: BattleSide; turnNumber: number } {
  if (activeSide === "player") {
    return { activeSide: "enemy", turnNumber };
  }
  return { activeSide: "player", turnNumber: turnNumber + 1 };
}

/**
 * Plans the handoff between turns: checks for a game-ending result, then
 * builds the SET_BATTLE_FLOW, energy-ramp, and draw edits for the next side.
 *
 * Win-check order (from the player's POV):
 *  1. player score >= scoreToWin → "victory"
 *  2. enemy score >= scoreToWin  → "defeat"
 *  3. next turnNumber > turnLimit → "draw"
 *  4. otherwise null
 *
 * A non-null result is still accompanied by a valid flowEdit; callers gate
 * on result to decide whether to continue the game loop.
 *
 * Draw skip: drawEdits is empty when nextTurnNumber === 1 (the very first
 * turn of the game). All subsequent turns receive a DRAW_CARD for the
 * incoming side.
 */
export function planHandoff(input: HandoffInput): HandoffPlan {
  const { state, scoreToWin, turnLimit, maxEnergyCap } = input;

  // --- Win check (before building next-turn values) ---
  let result: BattleResult | null = null;
  if (state.sides.player.score >= scoreToWin) {
    result = "victory";
  } else if (state.sides.enemy.score >= scoreToWin) {
    result = "defeat";
  }

  // --- Advance turn pair ---
  const next = advanceTurnPair(state.activeSide, state.turnNumber);

  // Draw check: evaluated against the NEXT turn number
  if (result === null && next.turnNumber > turnLimit) {
    result = "draw";
  }

  // --- flowEdit ---
  const flowEdit: BattleDebugEdit = {
    kind: "SET_BATTLE_FLOW",
    phase: "day",
    activeSide: next.activeSide,
    turnNumber: next.turnNumber,
  };

  // --- energyEdits ---
  const energyEdits = energyRampEdits(next.activeSide, next.turnNumber, maxEnergyCap);

  // --- drawEdits: skip only on turn 1 (the very first turn) ---
  const drawEdits: BattleDebugEdit[] =
    next.turnNumber === 1
      ? []
      : [{ kind: "DRAW_CARD", side: next.activeSide }];

  // --- Ending (outgoing) and Dawn (incoming) bookend edits ---
  const banishEdits = endingBanishEdits(state, state.activeSide);
  const clearEdits = dawnClearEdits(state, next.activeSide);

  return {
    result,
    endingBanishEdits: banishEdits,
    flowEdit,
    dawnClearEdits: clearEdits,
    drawEdits,
    energyEdits,
  };
}
