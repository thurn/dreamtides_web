import { useEffect, useMemo } from "react";
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
import type { BattlefieldDividerVariation } from "../../runtime/runtime-config";
import { logEvent } from "../../logging";

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
  battlefieldDividerVariation = "space",
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
  battlefieldDividerVariation?: BattlefieldDividerVariation;
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

  useEffect(() => {
    logEvent("battlefield_divider_rendered", {
      battleId: view.battleId,
      surface: "journey-battle",
      variation: battlefieldDividerVariation,
    });
  }, [battlefieldDividerVariation, view.battleId]);

  return (
    <MobileBattleScreen
      view={view}
      interactions={interactions}
      battlefieldDividerVariation={battlefieldDividerVariation}
    />
  );
}
