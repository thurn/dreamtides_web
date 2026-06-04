import type { BattleDebugEdit, } from "../debug/commands";
import type { BattleSide } from "../types";

/**
 * Returns the two debug edits needed to set both max and current energy for
 * `side` at the start of turn `turnNumber`, applying the standard ramp formula:
 *
 *   target = Math.min(turnNumber + 1, maxEnergyCap)
 *
 * Turn 1 yields target 2, matching the game's opening-energy convention.
 * Using SET (not ADJUST) makes the result deterministic regardless of whatever
 * energy the side already holds.
 *
 * The SET_MAX_ENERGY edit always precedes SET_CURRENT_ENERGY so callers that
 * apply them in order cannot transiently violate the current ≤ max invariant.
 */
export function energyRampEdits(
  side: BattleSide,
  turnNumber: number,
  maxEnergyCap: number,
): BattleDebugEdit[] {
  const value = Math.min(turnNumber + 1, maxEnergyCap);
  return [
    { kind: "SET_MAX_ENERGY", side, value },
    { kind: "SET_CURRENT_ENERGY", side, value },
  ];
}
