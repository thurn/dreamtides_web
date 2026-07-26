import { useCallback, useEffect, useMemo } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { BattleStartScreen } from "../../cumulus/screens/BattleStartScreen";
import type { CardData } from "../../types/cards";
import {
  buildBattleStartView,
  type BattleStartInit,
} from "./battle-start-view-model";

export function BattleStartScreenAdapter({
  init,
  cardDatabase,
  onBegin,
}: {
  init: BattleStartInit;
  cardDatabase: ReadonlyMap<number, CardData>;
  onBegin: () => void;
}) {
  const view = useMemo(
    () => buildBattleStartView(init, cardDatabase),
    [init, cardDatabase],
  );

  useEffect(() => {
    logEventOnce(
      `battle_start_screen_opened:${init.battleId}`,
      "battle_start_screen_opened",
      {
        battleId: init.battleId,
        enemyId: view.dreamAvatar.id,
        enemyName: view.dreamAvatar.name,
        scoreToWin: view.pointsToWin,
        essenceReward: view.essenceReward,
        dreamsignCount: view.dreamsigns.length,
        signatureCardIds: view.signatureCards.map((card) => card.cardId),
      },
    );
  }, [init.battleId, view]);

  const handleBegin = useCallback(() => {
    logEvent("battle_start_screen_begin_clicked", {
      battleId: init.battleId,
      enemyId: view.dreamAvatar.id,
    });
    onBegin();
  }, [init.battleId, onBegin, view.dreamAvatar.id]);

  return <BattleStartScreen view={view} onBegin={handleBegin} />;
}
