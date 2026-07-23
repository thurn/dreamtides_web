import { useCallback } from "react";
import { logEvent } from "../logging";
import type { FrontDoorMutations } from "./front-door-context";

/** Submit the authored tutorial handoff from the player to the opponent. */
export function useTutorialEndTurn(
  completeTutorialAction: FrontDoorMutations["completeTutorialAction"],
  battleId: string,
) {
  return useCallback(
    (runId: string, actionId: string): void => {
      logEvent("tutorial_end_turn_requested", {
        runId,
        actionId,
        battleId,
        sourceSide: "player",
        destinationSide: "enemy",
        destinationPhase: "dawn",
      });
      void completeTutorialAction(runId, actionId).catch((error: unknown) => {
        logEvent("tutorial_action_completion_failed", {
          runId,
          actionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [battleId, completeTutorialAction],
  );
}
