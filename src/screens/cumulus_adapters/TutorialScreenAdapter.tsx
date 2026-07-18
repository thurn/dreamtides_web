import { useEffect, useMemo, useRef } from "react";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { logEvent } from "../../logging";
import { buildTutorialView } from "./tutorial-view-model";

/** Standalone `/tutorial` wiring and presentation logging. */
export function TutorialScreenAdapter() {
  const hasLoggedPresentation = useRef(false);
  const view = useMemo(() => buildTutorialView(), []);

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("tutorial_screen_presented", {
      battleId: view.battle.battleId,
      activeSide: view.battle.activeSide,
      phase: view.battle.phase,
      playerDeckSize: view.battle.player.deckCardIds.length,
      enemyDeckSize: view.battle.enemy.deckCardIds.length,
    });
  }, [view]);

  return <TutorialScreen view={view} />;
}
