import { useCallback, useEffect, useMemo, useRef } from "react";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { logEvent } from "../../logging";
import { buildTutorialView } from "./tutorial-view-model";

/** Standalone `/tutorial` wiring and presentation logging. */
export function TutorialScreenAdapter() {
  const hasLoggedPresentation = useRef(false);
  const view = useMemo(() => buildTutorialView(), []);
  const handleDreamcallerArrivalComplete = useCallback(
    (dreamcallerId: string) => {
      logEvent("tutorial_dreamcaller_arrived", {
        battleId: view.battle.battleId,
        dreamcallerId,
        abilityActive: false,
      });
    },
    [view.battle.battleId],
  );
  const handleDialogueReplacementComplete = useCallback(() => {
    logEvent("tutorial_dialogue_replaced", {
      battleId: view.battle.battleId,
      dreamcallerId: view.dreamcaller.profile.id,
      dialogueSpeaker: view.dialogueAfterDreamcallerArrival.speakerName,
      dialogueText: view.dialogueAfterDreamcallerArrival.text,
    });
  }, [view]);

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("tutorial_screen_presented", {
      battleId: view.battle.battleId,
      activeSide: view.battle.activeSide,
      phase: view.battle.phase,
      playerDeckSize: view.battle.player.deckCardIds.length,
      enemyDeckSize: view.battle.enemy.deckCardIds.length,
      dialogueSpeaker: view.dialogue.speakerName,
      dialogueText: view.dialogue.text,
    });
  }, [view]);

  return (
    <TutorialScreen
      view={view}
      onDialogueReplacementComplete={handleDialogueReplacementComplete}
      onDreamcallerArrivalComplete={handleDreamcallerArrivalComplete}
    />
  );
}
