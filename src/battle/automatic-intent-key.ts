import type { BattleCommand } from "./debug/commands";
import type { BattleMutableState } from "./types";

/**
 * Returns the event-log identity for automatic battle flow that every client
 * may observe. User gestures return undefined and remain independent intents.
 */
export function automaticBattleIntentKey(
  battleId: string,
  state: Pick<BattleMutableState, "activeSide" | "turnNumber">,
  command: BattleCommand,
): string | undefined {
  if (command.id !== "DEBUG_EDIT") {
    return undefined;
  }
  if (
    command.edit.kind === "DRAW_DREAMWELL_CARD" &&
    command.edit.additional !== true
  ) {
    return [
      "battle",
      battleId,
      "dreamwell",
      command.edit.side,
      String(command.edit.turnNumber),
    ].join(":");
  }
  if (
    command.edit.kind === "SET_PHASE" &&
    command.sourceSurface === "auto-system"
  ) {
    return [
      "battle",
      battleId,
      "auto-phase",
      state.activeSide,
      String(state.turnNumber),
      command.edit.phase,
    ].join(":");
  }
  return undefined;
}
