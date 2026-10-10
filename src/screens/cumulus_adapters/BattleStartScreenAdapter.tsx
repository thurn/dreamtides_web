import { useCallback, useEffect, useMemo } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { BattleStartScreen } from "../../cumulus/screens/BattleStartScreen";
import type { CardData } from "../../types/cards";
import type { DreamscapeArtCatalog } from "../../data/dreamscapes";
import type { TutorialBattleStartConfiguration } from "../../types/tutorial";
import {
  buildBattleStartView,
  type BattleStartInit,
} from "./battle-start-view-model";

export function BattleStartScreenAdapter({
  init: preview,
  cardDatabase,
  artCatalog,
  isTutorialJourney,
  tutorialConfiguration,
  onBegin,
}: {
  /** The battle the screen previews. */
  init: BattleStartInit;
  cardDatabase: ReadonlyMap<number, CardData>;
  artCatalog: DreamscapeArtCatalog;
  isTutorialJourney: boolean;
  tutorialConfiguration?: TutorialBattleStartConfiguration;
  onBegin: () => void;
}) {
  const view = useMemo(
    () =>
      buildBattleStartView(preview, cardDatabase, artCatalog, {
        isTutorialJourney,
        configuration: tutorialConfiguration,
      }),
    [preview, cardDatabase, artCatalog, isTutorialJourney, tutorialConfiguration],
  );
  const { battleId, completionLevelAtStart } = preview.init;

  useEffect(() => {
    logEventOnce(
      `battle_start_screen_opened:${battleId}`,
      "battle_start_screen_opened",
      {
        battleId,
        enemyId: view.avatar.id,
        enemyName: view.avatar.name,
        scoreToWin: view.pointsToWin,
        essenceReward: view.essenceReward,
        dreamsignCount: view.dreamsigns.length,
        signatureCardIds: view.signatureCards.map((card) => card.cardId),
      },
    );
  }, [battleId, view]);

  const handleBegin = useCallback(() => {
    logEvent("battle_start_screen_begin_clicked", {
      battleId,
      enemyId: view.avatar.id,
    });
    onBegin();
  }, [battleId, onBegin, view.avatar.id]);

  const handleGuideDialogueShown = useCallback(() => {
    const guideDialogue = view.guideDialogue;
    if (guideDialogue === undefined) return;
    logEventOnce(
      `tutorial-battle-start-guidance:${battleId}`,
      "tutorial_battle_start_guidance_shown",
      {
        battleId,
        completionLevelAtStart,
        delaySeconds: guideDialogue.delaySeconds ?? 0,
        horizontalOffsetPx: guideDialogue.horizontalOffset,
        verticalOffsetPx: guideDialogue.verticalOffset,
        bubbleWidthPx: guideDialogue.bubbleWidth,
        text: guideDialogue.model.text,
      },
    );
  }, [battleId, completionLevelAtStart, view.guideDialogue]);

  return (
    <BattleStartScreen
      view={view}
      onBegin={handleBegin}
      onGuideDialogueShown={handleGuideDialogueShown}
    />
  );
}
