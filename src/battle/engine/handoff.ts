import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleResult, BattleSide } from "../types";
import { energyRampEdits } from "./energy";

export interface HandoffInput {
  state: BattleMutableState;
  scoreToWin: number;   // BattleInit.scoreToWin === 25
  turnLimit: number;    // BattleInit.turnLimit === 50
  maxEnergyCap: number; // 10
}

export interface HandoffPlan {
  result: BattleResult | null;        // "victory"|"defeat"|"draw"|null, from the PLAYER's POV
  flowEdit: BattleDebugEdit;          // SET_BATTLE_FLOW{phase:"day", activeSide, turnNumber}
  drawEdits: BattleDebugEdit[];       // DRAW_CARD for the next side (empty on the very first turn)
  energyEdits: BattleDebugEdit[];     // energyRampEdits for the next side
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

  return { result, flowEdit, drawEdits, energyEdits };
}
