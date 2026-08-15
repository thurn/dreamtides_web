import { useCallback, useEffect, useMemo } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { BattleStartScreen } from "../../cumulus/screens/BattleStartScreen";
import type { CardData } from "../../types/cards";
import type { TutorialBattleStartConfiguration } from "../../types/tutorial";
import {
  buildBattleStartView,
  type BattleStartInit,
} from "./battle-start-view-model";

export function BattleStartScreenAdapter({
  init,
  cardDatabase,
  isTutorialJourney,
  tutorialConfiguration,
  onBegin,
}: {
  init: BattleStartInit;
  cardDatabase: ReadonlyMap<number, CardData>;
  isTutorialJourney: boolean;
  tutorialConfiguration?: TutorialBattleStartConfiguration;
  onBegin: () => void;
}) {
  const view = useMemo(
    () =>
      buildBattleStartView(init, cardDatabase, {
        isTutorialJourney,
        configuration: tutorialConfiguration,
      }),
    [init, cardDatabase, isTutorialJourney, tutorialConfiguration],
  );

  useEffect(() => {
    logEventOnce(
      `battle_start_screen_opened:${init.battleId}`,
      "battle_start_screen_opened",
      {
        battleId: init.battleId,
        enemyId: view.avatar.id,
        enemyName: view.avatar.name,
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
      enemyId: view.avatar.id,
    });
    onBegin();
  }, [init.battleId, onBegin, view.avatar.id]);

  const handleGuideDialogueShown = useCallback(() => {
    const guideDialogue = view.guideDialogue;
    if (guideDialogue === undefined) return;
    logEventOnce(
      `tutorial-battle-start-guidance:${init.battleId}`,
      "tutorial_battle_start_guidance_shown",
      {
        battleId: init.battleId,
        completionLevelAtStart: init.completionLevelAtStart,
        delaySeconds: guideDialogue.delaySeconds ?? 0,
        horizontalOffsetPx: guideDialogue.horizontalOffset,
        verticalOffsetPx: guideDialogue.verticalOffset,
        bubbleWidthPx: guideDialogue.bubbleWidth,
        text: guideDialogue.model.text,
      },
    );
  }, [init.battleId, init.completionLevelAtStart, view.guideDialogue]);

  return (
    <BattleStartScreen
      view={view}
      onBegin={handleBegin}
      onGuideDialogueShown={handleGuideDialogueShown}
    />
  );
}
