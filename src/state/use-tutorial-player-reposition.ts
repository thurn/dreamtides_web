import { useCallback } from "react";
import { logEvent } from "../logging";
import type { FrontDoorMutations } from "./front-door-context";

/** Submit and log the tutorial player's guided front-rank block. */
export function useTutorialPlayerReposition(
  completeTutorialAction: FrontDoorMutations["completeTutorialAction"],
  battleId: string,
) {
  return useCallback(
    (
      runId: string,
      actionId: string,
      cardId: string,
      opposingCardId: string,
      targetSlotId: string,
    ): void => {
      logEvent("tutorial_player_character_reposition_requested", {
        battleId,
        runId,
        actionId,
        cardId,
        opposingCardId,
        targetSlotId,
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
