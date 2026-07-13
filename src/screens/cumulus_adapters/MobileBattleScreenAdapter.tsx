import { useMemo } from "react";
import {
  MobileBattleScreen,
  type MobileBattleInteractions,
} from "../../cumulus/screens/MobileBattleScreen";
import {
  buildMobileBattleView,
  type MobileBattleBoard,
  type MobileBattleDreamcaller,
  type MobileBattleInit,
} from "./mobile-battle-view-model";

export function MobileBattleScreenAdapter({
  init,
  board,
  enemyDreamcaller,
  interactions,
}: {
  init: MobileBattleInit;
  board: MobileBattleBoard;
  enemyDreamcaller: MobileBattleDreamcaller;
  interactions: MobileBattleInteractions;
}) {
  const view = useMemo(
    () => buildMobileBattleView(init, board, enemyDreamcaller),
    [init, board, enemyDreamcaller],
  );

  return <MobileBattleScreen view={view} interactions={interactions} />;
}
