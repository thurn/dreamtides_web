import { useCallback } from "react";
import { logEvent } from "../logging";
import type { FrontDoorMutations } from "./front-door-context";
import type { BattleId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { TutorialRunId } from "../types/identifiers";
import type { TutorialActionId } from "../types/identifiers";
import type { BattleSlotViewId } from "../types/identifiers";

/** Submit and log the tutorial player's guided front-rank block. */
export function useTutorialPlayerReposition(
  completeTutorialAction: FrontDoorMutations["completeTutorialAction"],
  battleId: BattleId,
) {
  return useCallback(
    (
      runId: TutorialRunId,
      actionId: TutorialActionId,
      cardId: CardId,
      opposingCardId: CardId,
      targetSlotId: BattleSlotViewId,
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
