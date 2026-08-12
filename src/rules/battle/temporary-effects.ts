import type { BattleCardInstance, BattleMutableState } from "../../battle/types";

/** True only during the exact turn/active-side window granted by Firmament Mirror. */
export function hasTemporaryReclaimEligibility(
  state: BattleMutableState,
  instance: BattleCardInstance,
): boolean {
  const grant = instance.status.temporaryReclaimUntilEnding;
  return grant?.activeSide === state.activeSide && grant.turnNumber === state.turnNumber;
}
