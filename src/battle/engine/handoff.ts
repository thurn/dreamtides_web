import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleResult, BattleSide } from "../types";
import { rankSlotIds } from "../types";

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
  /**
   * SET_BATTLE_FLOW{phase:"dreamwell", activeSide, turnNumber}. The handoff lands
   * the incoming side on its Dreamwell phase, a surfaced stop the player clicks
   * through after seeing the drawn Dreamwell card; the card's energy is applied
   * when its reveal resolves, not here.
   */
  flowEdit: BattleDebugEdit;
  /**
   * Ending bookend: every in-play character loses the exhausted status before
   * the side flip.
   */
  exhaustionClearEdits: BattleDebugEdit[];
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
  for (const slotId of rankSlotIds(sideState.backRank)) {
    appendBanishEdit(state, side, sideState.backRank[slotId], "offering", edits);
  }
  for (const slotId of rankSlotIds(sideState.frontRank)) {
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
 * Ending: clears the exhausted status from every in-play character (front or
 * back rank) of `side`. Emits a `SET_CARD_STATUS` clear only for characters
 * that are currently exhausted, so a board with nothing to awaken produces no
 * edits.
 */
export function endOfTurnExhaustionClearEdits(
  state: BattleMutableState,
  side: BattleSide,
): BattleDebugEdit[] {
  const edits: BattleDebugEdit[] = [];
  const sideState = state.sides[side];

  for (const slotId of rankSlotIds(sideState.backRank)) {
    appendExhaustClearEdit(state, sideState.backRank[slotId], edits);
  }
  for (const slotId of rankSlotIds(sideState.frontRank)) {
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
 * builds the Ending cleanup and SET_BATTLE_FLOW edit for the next side.
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
 * The incoming side's ordinary turn draw belongs to the later transition out
 * of Dreamwell, after that card's effect has resolved.
 */
export function planHandoff(input: HandoffInput): HandoffPlan {
  const { state, scoreToWin, turnLimit } = input;

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

  // --- flowEdit: land the incoming side on its Dreamwell phase (a surfaced
  // stop the player clicks through). The Dreamwell card's energy is applied when
  // its reveal resolves, so the handoff itself does not ramp energy. ---
  const flowEdit: BattleDebugEdit = {
    kind: "SET_BATTLE_FLOW",
    phase: "dreamwell",
    activeSide: next.activeSide,
    turnNumber: next.turnNumber,
  };

  // --- Ending bookend edits ---
  const banishEdits = endingBanishEdits(state, state.activeSide);
  const clearEdits = [
    ...endOfTurnExhaustionClearEdits(state, "player"),
    ...endOfTurnExhaustionClearEdits(state, "enemy"),
  ];

  return {
    result,
    endingBanishEdits: banishEdits,
    flowEdit,
    exhaustionClearEdits: clearEdits,
  };
}
