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
} from "./mobile-battle-view-model";

export function MobileBattleScreenAdapter({
  init,
  board,
  enemyDreamcaller,
  aiProposal,
  aiMode,
  isOpponentHandRevealed,
  isPlayerHandHidden,
  interactions,
}: {
  init: MobileBattleInit;
  board: MobileBattleBoard;
  enemyDreamcaller: MobileBattleDreamcaller;
  aiProposal: MobileBattleAiProposal | null;
  aiMode: boolean;
  isOpponentHandRevealed: boolean;
  isPlayerHandHidden: boolean;
  interactions: MobileBattleInteractions;
}) {
  const view = useMemo(
    () => buildMobileBattleView(init, board, enemyDreamcaller, aiProposal, {
      aiMode,
      isOpponentHandRevealed,
      isPlayerHandHidden,
    }),
    [init, board, enemyDreamcaller, aiProposal, aiMode, isOpponentHandRevealed, isPlayerHandHidden],
  );

  return <MobileBattleScreen view={view} interactions={interactions} />;
}
