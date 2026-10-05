import { useCallback, useEffect, useMemo, useRef } from "react";
import { TutorialScreen } from "../../cumulus/screens/TutorialScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { useTutorialActions } from "../../state/use-tutorial-actions";
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
import type { AvatarContent } from "../../types/content";
import type { TutorialAvatarOwner } from "../../types/tutorial";
import * as tutorialView from "./tutorial-view-model";
import { useJourney } from "../../state/journey-context";
import type { AvatarId, IntentKey } from "../../types/identifiers";
import { parseIntentKey } from "../../types/identifiers";
export function TutorialScreenAdapter({
  avatars,
  playbackSpeed = 1,
  directLive = false,
}: {
  readonly avatars: readonly AvatarContent[];
  readonly playbackSpeed?: number;
  readonly directLive?: boolean;
}) {
  const { state, mutations } = useFrontDoor();
  const { journeyContent } = useJourney();
  const battleConfiguration = journeyContent.tutorial?.battle;
  if (battleConfiguration === undefined) {
    throw new Error("Tutorial battle configuration is missing.");
  }
  const authoredActions = useTutorialActions();
  const beginRequestedKey = useRef<IntentKey | null>(null);
  const tutorialCards = useTutorialCards();
  useEffect(() => {
    if (state.tutorial !== null || state.journeyId === null) return;
    const intentKey = parseIntentKey(`tutorial:${state.journeyId}:begin`);
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
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [directLive, authoredActions, mutations, state.journeyId, state.tutorial]);
  useTutorialBattleHandoff(state.tutorial, mutations.beginTutorialBattle);
  const view = useMemo(
    () =>
      tutorialView.buildTutorialView(
        avatars,
        battleConfiguration,
        state.tutorial,
        tutorialCards.cards,
        tutorialCards.dreamwell,
      ),
    [battleConfiguration, avatars, state.tutorial, tutorialCards],
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
  const handleAvatarArrivalComplete = useCallback(
    (avatarId: AvatarId, owner: TutorialAvatarOwner): void => {
      logEvent("tutorial_avatar_arrived", {
        battleId: view.battle.battleId,
        avatarId,
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
      onActionComplete={handleActionComplete}
      onAvatarArrivalComplete={handleAvatarArrivalComplete}
      {...howToPlayLogging}
      onPlayerCardPlay={handlePlayerCardPlay}
      onEndTurn={handleEndTurn}
      onPlayerCharacterReposition={handlePlayerCharacterReposition}
    />
  );
}
