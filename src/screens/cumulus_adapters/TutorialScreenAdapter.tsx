/* eslint-disable max-lines -- tutorial orchestration is intentionally centralized here. */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { assertLocalized } from "@trox/runtime";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import * as tutorialEditor from "../../state/use-tutorial-editor";
import { useTutorialActionComplete } from "../../state/use-tutorial-action-complete";
import { useTutorialCardPlay } from "../../state/use-tutorial-card-play";
import { useTutorialEndTurn } from "../../state/use-tutorial-end-turn";
import { useTutorialPlayerReposition } from "../../state/use-tutorial-player-reposition";
import { useTutorialCards } from "../../state/use-tutorial-cards";
import { useTutorialBattleHandoff } from "../../state/use-tutorial-battle-handoff";
import {
  useTutorialHowToPlayLogging,
  useTutorialPresentationLogging,
} from "../../state/use-tutorial-presentation-logging";
import type { DreamAvatarContent } from "../../types/content";
import type { TutorialDreamAvatarOwner } from "../../types/tutorial";
import * as tutorialView from "./tutorial-view-model";
import { useJourney } from "../../state/journey-context";
import type { DreamAvatarId, IntentKey } from "../../types/identifiers";
import { asIntentKey } from "../../types/identifiers";
export function TutorialScreenAdapter({
  dreamAvatars,
  playbackSpeed = 1,
  directLive = false,
}: {
  readonly dreamAvatars: readonly DreamAvatarContent[];
  readonly playbackSpeed?: number;
  readonly directLive?: boolean;
}) {
  const { state, mutations } = useFrontDoor();
  const { journeyContent } = useJourney();
  const battleConfiguration = journeyContent.tutorial?.battle;
  if (battleConfiguration === undefined) {
    throw new Error("Tutorial battle configuration is missing.");
  }
  const {
    actions: authoredActions,
    loaded: actionsLoaded,
    saveStatus,
    saveError,
    onActionsChange: handleEditorActionsChange,
  } = tutorialEditor.useTutorialEditor();
  const beginRequestedKey = useRef<IntentKey | null>(null);
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
    const intentKey = asIntentKey(`tutorial:${state.journeyId}:begin`);
    if (beginRequestedKey.current === intentKey) return;
    beginRequestedKey.current = intentKey;
    void mutations
      .beginTutorial(authoredActions, {
        intentKey,
        ...(directLive ? { startAtEnd: true } : {}),
      })
      .catch((error: unknown) => {
        beginRequestedKey.current = null;
        logEvent("tutorial_begin_failed", {
          // localization-ignore: exception detail is diagnostic log payload.
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [
    actionsLoaded,
    directLive,
    authoredActions,
    mutations,
    tutorialCards,
    state.journeyId,
    state.tutorial,
  ]);
  useTutorialBattleHandoff(state.tutorial, mutations.beginTutorialBattle);
  const view = useMemo(
    () =>
      tutorialView.buildTutorialView(
        dreamAvatars,
        battleConfiguration,
        state.tutorial,
        tutorialCards?.cards ?? null,
        tutorialCards?.dreamwell ?? null,
      ),
    [battleConfiguration, dreamAvatars, state.tutorial, tutorialCards],
  );
  useTutorialPresentationLogging(
    state.tutorial,
    view,
    battleConfiguration.tutorialCardConstants.tutorialDreamwellCardId,
    playbackSpeed,
  );
  const howToPlayLogging = useTutorialHowToPlayLogging(view.battle.battleId);
  const completeAction = mutations.completeTutorialAction;
  const handleActionComplete = useTutorialActionComplete(completeAction);
  const handleDreamAvatarArrivalComplete = useCallback(
    (dreamAvatarId: DreamAvatarId, owner: TutorialDreamAvatarOwner): void => {
      logEvent("tutorial_dream_avatar_arrived", {
        battleId: view.battle.battleId,
        dreamAvatarId,
        owner,
        actionId: view.currentAction?.id ?? null,
        abilityActive: false,
      });
    },
    [view.battle.battleId, view.currentAction?.id],
  );
  const handlePlayerCardPlay = useTutorialCardPlay(
    mutations.action,
    view.battle.battleId,
  );
  const handleEndTurn = useTutorialEndTurn(
    completeAction,
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
          ? {
              actions: authoredActions,
              tutorialCardConstants: battleConfiguration.tutorialCardConstants,
              saveStatus,
              saveError: saveError === null ? null : assertLocalized(saveError),
            }
          : undefined
      }
      onActionComplete={handleActionComplete}
      onDreamAvatarArrivalComplete={handleDreamAvatarArrivalComplete}
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
