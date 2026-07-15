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
  interactions,
}: {
  init: MobileBattleInit;
  board: MobileBattleBoard;
  enemyDreamcaller: MobileBattleDreamcaller;
  aiProposal: MobileBattleAiProposal | null;
  interactions: MobileBattleInteractions;
}) {
  const view = useMemo(
    () => buildMobileBattleView(init, board, enemyDreamcaller, aiProposal),
    [init, board, enemyDreamcaller, aiProposal],
  );

  return <MobileBattleScreen view={view} interactions={interactions} />;
}
