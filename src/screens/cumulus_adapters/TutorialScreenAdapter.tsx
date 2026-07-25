import { useCallback, useEffect, useMemo, useRef } from "react";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import * as tutorialEditor from "../../state/use-tutorial-editor";
import { useTutorialActionComplete } from "../../state/use-tutorial-action-complete";
import { useTutorialCardPlay } from "../../state/use-tutorial-card-play";
import { useTutorialEndTurn } from "../../state/use-tutorial-end-turn";
import { useTutorialPlayerReposition } from "../../state/use-tutorial-player-reposition";
import { useTutorialCards } from "../../state/use-tutorial-opponent-card";
import {
  useTutorialHowToPlayLogging,
  useTutorialPresentationLogging,
} from "../../state/use-tutorial-presentation-logging";
import type { TutorialDreamcallerOwner } from "../../types/tutorial";
import * as tutorialView from "./tutorial-view-model";
/** Standalone `/tutorial` wiring, shared playback, and local authoring saves. */
export function TutorialScreenAdapter({
  playbackSpeed = 1,
}: {
  readonly playbackSpeed?: number;
}) {
  const { state, mutations } = useFrontDoor();
  const {
    actions: authoredActions,
    loaded: actionsLoaded,
    saveStatus,
    saveError,
    onActionsChange: handleEditorActionsChange,
  } = tutorialEditor.useTutorialEditor();
  const beginRequestedKey = useRef<string | null>(null);
  const tutorialCards = useTutorialCards();
  const handleReplay = tutorialEditor.useTutorialReplay(
    authoredActions,
    mutations.beginTutorial,
  );
  useEffect(() => {
    if (
      !actionsLoaded ||
      tutorialCards === null ||
      state.tutorial !== null ||
      state.journeyId === null
    )
      return;
    const intentKey = `tutorial:${state.journeyId}:begin`;
    if (beginRequestedKey.current === intentKey) return;
    beginRequestedKey.current = intentKey;
    void mutations
      .beginTutorial(authoredActions, { intentKey })
      .catch((error: unknown) => {
        beginRequestedKey.current = null;
        logEvent("tutorial_begin_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [
    actionsLoaded,
    authoredActions,
    mutations,
    tutorialCards,
    state.journeyId,
    state.tutorial,
  ]);
  const view = useMemo(
    () =>
      tutorialView.buildTutorialView(
        state.tutorial,
        tutorialCards?.opponents ?? null,
        tutorialCards?.player ?? null,
        tutorialCards?.dreamwell ?? null,
      ),
    [state.tutorial, tutorialCards],
  );
  useTutorialPresentationLogging(state.tutorial, view, playbackSpeed);
  const howToPlayLogging = useTutorialHowToPlayLogging(view.battle.battleId);

  const handleActionComplete = useTutorialActionComplete(
    mutations.completeTutorialAction,
  );

  const handleDreamcallerArrivalComplete = useCallback(
    (dreamcallerId: string, owner: TutorialDreamcallerOwner): void => {
      logEvent("tutorial_dreamcaller_arrived", {
        battleId: view.battle.battleId,
        dreamcallerId,
        owner,
        actionId: view.currentAction?.id ?? null,
        abilityActive: false,
      });
    },
    [view.battle.battleId, view.currentAction?.id],
  );

  const handlePlayerCardPlay = useTutorialCardPlay(mutations.action, view.battle.battleId);
  const handleEndTurn = useTutorialEndTurn(
    mutations.completeTutorialAction,
    view.battle.battleId,
  );
  const handlePlayerCharacterReposition = useTutorialPlayerReposition(
    mutations.completeTutorialAction,
    view.battle.battleId,
  );

  return (
    <TutorialScreen
      view={view}
      playbackSpeed={playbackSpeed}
      editor={
        import.meta.env.DEV
          ? { actions: authoredActions, saveStatus, saveError }
          : undefined
      }
      onActionComplete={handleActionComplete}
      onDreamcallerArrivalComplete={handleDreamcallerArrivalComplete}
      {...howToPlayLogging}
      onPlayerCardPlay={handlePlayerCardPlay}
      onEndTurn={handleEndTurn}
      onPlayerCharacterReposition={handlePlayerCharacterReposition}
      onEditorActionsChange={handleEditorActionsChange}
      onReplay={handleReplay}
      onPlayFromAction={handleReplay}
    />
  );
}
