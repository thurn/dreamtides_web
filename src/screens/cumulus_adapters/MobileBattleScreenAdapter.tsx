import { useMemo } from "react";
import {
  MobileBattleScreen,
  type MobileBattleInteractions,
} from "../../cumulus/screens/MobileBattleScreen";
import {
  buildMobileBattleView,
  type MobileBattleAiProposal,
  type MobileBattleBoard,
  type MobileBattleDreamAvatar,
  type MobileBattleInit,
  type MobileBattlePendingPrompt,
} from "./mobile-battle-view-model";

export function MobileBattleScreenAdapter({
  init,
  board,
  enemyDreamAvatar,
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
  enemyDreamAvatar: MobileBattleDreamAvatar;
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
      buildMobileBattleView(init, board, enemyDreamAvatar, aiProposal, {
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
      enemyDreamAvatar,
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

  return <MobileBattleScreen view={view} interactions={interactions} />;
}
