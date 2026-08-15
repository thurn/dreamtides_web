import type { BattleCommand } from "./debug/commands";
import type { BattleMutableState } from "./types";
import type { BattleId, IntentKey } from "../types/identifiers";
import { parseIntentKey } from "../types/identifiers";

/**
 * Returns the event-log identity for automatic battle flow that every client
 * may observe. User gestures return undefined and remain independent intents.
 */
export function automaticBattleIntentKey(
  battleId: BattleId,
  state: Pick<BattleMutableState, "activeSide" | "turnNumber">,
  command: BattleCommand,
): IntentKey | undefined {
  if (command.id !== "DEBUG_EDIT") {
    return undefined;
  }
  if (
    command.edit.kind === "DRAW_DREAMWELL_CARD" &&
    command.edit.additional !== true
  ) {
    return parseIntentKey(
      [
        "battle",
        battleId,
        "dreamwell",
        command.edit.side,
        String(command.edit.turnNumber),
      ].join(":"),
    );
  }
  if (
    command.edit.kind === "SET_PHASE" &&
    command.sourceSurface === "auto-system"
  ) {
    return parseIntentKey(
      [
        "battle",
        battleId,
        "auto-phase",
        state.activeSide,
        String(state.turnNumber),
        command.edit.phase,
      ].join(":"),
    );
  }
  return undefined;
}
