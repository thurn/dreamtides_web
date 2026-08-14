import { useCallback } from "react";
import { logEvent } from "../logging";
import type { FrontDoorMutations } from "./front-door-context";
import type {
  BattleCardId,
  BattleId,
  BattleSlotViewId,
} from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { TutorialRunId } from "../types/identifiers";
import { asFrontDoorActionId } from "../types/identifiers";

/** Submit and log the tutorial player's authoritative first card play. */
export function useTutorialCardPlay(
  action: FrontDoorMutations["action"],
  battleId: BattleId,
) {
  return useCallback(
    (
      runId: TutorialRunId,
      cardInstanceId: BattleCardId,
      cardId: CardId,
      targetSlotId: BattleSlotViewId | null,
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
      void action("tutorial", asFrontDoorActionId("play-card"), {
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
