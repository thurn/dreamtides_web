import { useCallback, useEffect, useMemo, useRef } from "react";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import {
  useTutorialEditor,
  useTutorialReplay,
} from "../../state/use-tutorial-editor";
import { useTutorialOpponentCard } from "../../state/use-tutorial-opponent-card";
import type { TutorialDreamcallerOwner } from "../../types/tutorial";
import {
  buildTutorialView,
  tutorialActionLogDetails,
} from "./tutorial-view-model";
/** Standalone `/tutorial` wiring, shared playback, and local authoring saves. */
export function TutorialScreenAdapter() {
  const { state, mutations } = useFrontDoor();
  const {
    actions: authoredActions,
    loaded: actionsLoaded,
    saveStatus,
    saveError,
    onActionsChange: handleEditorActionsChange,
  } = useTutorialEditor();
  const beginRequestedKey = useRef<string | null>(null);
  const loggedActionKey = useRef<string | null>(null);
  const opponentCard = useTutorialOpponentCard();
  const handleReplay = useTutorialReplay(authoredActions, mutations.beginTutorial);
  useEffect(() => {
    if (
      !actionsLoaded ||
      opponentCard === null ||
      state.tutorial !== null ||
      state.journeyId === null
    )
      return;
    const intentKey = `tutorial:${state.journeyId}:begin`;
    if (beginRequestedKey.current === intentKey) return;
    beginRequestedKey.current = intentKey;
    void mutations
      .beginTutorial(authoredActions, intentKey)
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
    opponentCard,
    state.journeyId,
    state.tutorial,
  ]);
  const view = useMemo(
    () => buildTutorialView(state.tutorial, opponentCard),
    [opponentCard, state.tutorial],
  );

  useEffect(() => {
    const current = view.currentAction;
    if (current === null || view.playbackRunId === null) return;
    const key = `${view.playbackRunId}:${current.id}`;
    if (loggedActionKey.current === key) return;
    loggedActionKey.current = key;
    logEvent("tutorial_action_presented", {
      runId: view.playbackRunId,
      ...tutorialActionLogDetails(current),
      dialogueVisible: view.dialogue !== null,
      dialogueText:
        view.dialogue === null
          ? null
          : view.dialogue.kind === "guide"
            ? view.dialogue.model.text
            : view.dialogue.text,
      actionIndex: state.tutorial?.currentActionIndex ?? null,
      actionCount: state.tutorial?.actions.length ?? 0,
    });
  }, [state.tutorial, view.currentAction, view.dialogue, view.playbackRunId]);

  const handleActionComplete = useCallback(
    (runId: string, actionId: string): void => {
      logEvent("tutorial_action_completion_requested", { runId, actionId });
      void mutations
        .completeTutorialAction(runId, actionId)
        .catch((error: unknown) => {
          logEvent("tutorial_action_completion_failed", {
            runId,
            actionId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [mutations],
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

  return (
    <TutorialScreen
      view={view}
      editor={
        import.meta.env.DEV
          ? { actions: authoredActions, saveStatus, saveError }
          : undefined
      }
      onActionComplete={handleActionComplete}
      onDreamcallerArrivalComplete={handleDreamcallerArrivalComplete}
      onEditorActionsChange={handleEditorActionsChange}
      onReplay={handleReplay}
    />
  );
}
