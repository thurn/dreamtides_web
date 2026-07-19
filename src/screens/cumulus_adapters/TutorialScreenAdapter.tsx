import { useCallback, useEffect, useMemo, useRef } from "react";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { parseTutorialActions } from "../../data/tutorial-actions";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { useTutorialEditor } from "../../state/use-tutorial-editor";
import type { TutorialAction, TutorialDreamcallerOwner } from "../../types/tutorial";
import { buildTutorialView } from "./tutorial-view-model";

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
  const authoredActionsRef = useRef(authoredActions);
  const beginRequestedKey = useRef<string | null>(null);
  const loggedActionKey = useRef<string | null>(null);
  authoredActionsRef.current = authoredActions;

  useEffect(() => {
    if (!actionsLoaded || state.tutorial !== null || state.journeyId === null) return;
    const intentKey = `tutorial:${state.journeyId}:begin`;
    if (beginRequestedKey.current === intentKey) return;
    beginRequestedKey.current = intentKey;
    void mutations.beginTutorial(authoredActions, intentKey).catch((error: unknown) => {
      beginRequestedKey.current = null;
      logEvent("tutorial_begin_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, [actionsLoaded, authoredActions, mutations, state.journeyId, state.tutorial]);

  const view = useMemo(() => buildTutorialView(state.tutorial), [state.tutorial]);

  useEffect(() => {
    const current = view.currentAction;
    if (current === null || view.playbackRunId === null) return;
    const key = `${view.playbackRunId}:${current.id}`;
    if (loggedActionKey.current === key) return;
    loggedActionKey.current = key;
    logEvent("tutorial_action_presented", {
      runId: view.playbackRunId,
      actionId: current.id,
      action: current.action,
      waitSeconds: current.wait,
      dialogueVisible: view.dialogue !== null,
      dialogueText: view.dialogue?.text ?? null,
      ...(current.action === "animate-dreamcaller-portrait"
        ? {
            owner: current.owner,
            portraitPauseSeconds: current.pause,
            portraitTravelSeconds: current.duration,
          }
        : {}),
      actionIndex: state.tutorial?.currentActionIndex ?? null,
      actionCount: state.tutorial?.actions.length ?? 0,
    });
  }, [state.tutorial, view.currentAction, view.dialogue, view.playbackRunId]);

  const handleActionComplete = useCallback(
    (runId: string, actionId: string): void => {
      logEvent("tutorial_action_completion_requested", { runId, actionId });
      void mutations.completeTutorialAction(runId, actionId).catch((error: unknown) => {
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

  const handleReplay = useCallback((): void => {
    let normalized: readonly TutorialAction[];
    try {
      normalized = parseTutorialActions(authoredActionsRef.current);
    } catch (error) {
      logEvent("tutorial_replay_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    logEvent("tutorial_replay_requested", {
      actionCount: normalized.length,
      actionIds: normalized.map((action) => action.id),
    });
    void mutations.beginTutorial(normalized).catch((error: unknown) => {
      logEvent("tutorial_replay_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, [mutations]);

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
