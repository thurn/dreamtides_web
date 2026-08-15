import { useEffect, useMemo } from "react";
import {
  MobileBattleScreen,
  type MobileBattleInteractions,
} from "../../cumulus/screens/MobileBattleScreen";
import {
  buildMobileBattleView,
  type MobileBattleAiProposal,
  type MobileBattleBoard,
  type MobileBattleAvatar,
  type MobileBattleInit,
  type MobileBattlePendingPrompt,
} from "./mobile-battle-view-model";
import { logEvent } from "../../logging";

export function MobileBattleScreenAdapter({
  init,
  board,
  enemyAvatar,
  aiProposal,
  aiMode,
  isOpponentHandRevealed,
  isPlayerHandHidden,
  perspectiveSide,
  pendingPrompt,
  confirmedPromptId,
  isResultOverlayDismissed,
  interactions,
}: {
  init: MobileBattleInit;
  board: MobileBattleBoard;
  enemyAvatar: MobileBattleAvatar;
  aiProposal: MobileBattleAiProposal | null;
  aiMode: boolean;
  isOpponentHandRevealed: boolean;
  isPlayerHandHidden: boolean;
  perspectiveSide: "player" | "enemy";
  pendingPrompt: MobileBattlePendingPrompt | null;
  confirmedPromptId: number | null;
  isResultOverlayDismissed: boolean;
  interactions: MobileBattleInteractions;
}) {
  const view = useMemo(
    () =>
      buildMobileBattleView(init, board, enemyAvatar, aiProposal, {
        aiMode,
        isOpponentHandRevealed,
        isPlayerHandHidden,
        perspectiveSide,
        isFarHandRevealed: isOpponentHandRevealed,
        isNearHandHidden: isPlayerHandHidden,
        pendingPrompt,
        confirmedPromptId,
        isResultOverlayDismissed,
      }),
    [
      init,
      board,
      enemyAvatar,
      aiProposal,
      aiMode,
      isOpponentHandRevealed,
      isPlayerHandHidden,
      perspectiveSide,
      pendingPrompt,
      confirmedPromptId,
      isResultOverlayDismissed,
    ],
  );

  useEffect(() => {
    logEvent("battlefield_gap_rendered", {
      battleId: view.battleId,
      surface: "journey-battle",
    });
  }, [view.battleId]);

  return <MobileBattleScreen view={view} interactions={interactions} />;
}
