import type { BattleMutableState, BattleSide } from "../types";

/**
 * Pure helper that predicts the side/turnNumber pair that the next
 * start-of-turn belongs to. The note editor uses it to compute the
 * `atStartOfTurn` expiry for a freshly created card note: a note created on
 * the active side expires the moment that side hands off, so the relevant
 * pair is the opposing side and — when the enemy is finishing its turn — the
 * incremented turn number.
 */
export function nextStartOfTurnPair(
  state: Pick<BattleMutableState, "activeSide" | "turnNumber">,
): {
  side: BattleSide;
  turnNumber: number;
} {
  const endingSide = state.activeSide;
  const side: BattleSide = endingSide === "player" ? "enemy" : "player";
  const turnNumber = state.turnNumber + (endingSide === "enemy" ? 1 : 0);
  return { side, turnNumber };
}
