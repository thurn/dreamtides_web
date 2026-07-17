import { useMemo } from "react";
import {
  MobileBattleScreen,
  type MobileBattleInteractions,
} from "../../cumulus/screens/MobileBattleScreen";
import {
  buildMobileBattleView,
  type MobileBattleAiProposal,
  type MobileBattleBoard,
  type MobileBattleDreamcaller,
  type MobileBattleInit,
  type MobileBattlePendingPrompt,
} from "./mobile-battle-view-model";

export function MobileBattleScreenAdapter({
  init,
  board,
  enemyDreamcaller,
  aiProposal,
  aiMode,
  isOpponentHandRevealed,
  isPlayerHandHidden,
  pendingPrompt,
  confirmedPromptId,
  isResultOverlayDismissed,
  interactions,
}: {
  init: MobileBattleInit;
  board: MobileBattleBoard;
  enemyDreamcaller: MobileBattleDreamcaller;
  aiProposal: MobileBattleAiProposal | null;
  aiMode: boolean;
  isOpponentHandRevealed: boolean;
  isPlayerHandHidden: boolean;
  pendingPrompt: MobileBattlePendingPrompt | null;
  confirmedPromptId: number | null;
  isResultOverlayDismissed: boolean;
  interactions: MobileBattleInteractions;
}) {
  const view = useMemo(
    () =>
      buildMobileBattleView(init, board, enemyDreamcaller, aiProposal, {
        aiMode,
        isOpponentHandRevealed,
        isPlayerHandHidden,
        pendingPrompt,
        confirmedPromptId,
        isResultOverlayDismissed,
      }),
    [
      init,
      board,
      enemyDreamcaller,
      aiProposal,
      aiMode,
      isOpponentHandRevealed,
      isPlayerHandHidden,
      pendingPrompt,
      confirmedPromptId,
      isResultOverlayDismissed,
    ],
  );

  return <MobileBattleScreen view={view} interactions={interactions} />;
}
