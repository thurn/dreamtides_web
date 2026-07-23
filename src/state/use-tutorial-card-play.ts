import { useCallback } from "react";
import { logEvent } from "../logging";
import type { FrontDoorMutations } from "./front-door-context";

/** Submit and log the tutorial player's authoritative first card play. */
export function useTutorialCardPlay(
  action: FrontDoorMutations["action"],
  battleId: string,
) {
  return useCallback(
    (
      runId: string,
      cardInstanceId: string,
      cardId: string,
      targetSlotId: string | null,
    ): void => {
      logEvent("tutorial_player_card_play_requested", {
        runId,
        battleId,
        cardInstanceId,
        cardId,
        sourceZone: "player-hand",
        destinationZone: "player-back-rank",
        targetSlotId,
      });
      void action("tutorial", "play-card", {
        runId,
        cardInstanceId,
        cardId,
        targetSlotId,
      }).catch((error: unknown) => {
        logEvent("tutorial_player_card_play_failed", {
          runId,
          battleId,
          cardInstanceId,
          cardId,
          targetSlotId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [action, battleId],
  );
}
