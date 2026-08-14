import { useCallback, useEffect, useRef } from "react";
import type {
  TutorialScreenProps,
  TutorialView,
} from "../cumulus/screens/TutorialScreen";
import { logEvent } from "../logging";
import { tutorialActionLogDetails } from "../screens/cumulus_adapters/tutorial-view-model";
import type {
  TutorialHowToPlayTrigger,
  TutorialPlaybackState,
} from "../types/tutorial";
import type { BattleId } from "../types/identifiers";
import type { TutorialRunId } from "../types/identifiers";
import type { TutorialActionId } from "../types/identifiers";
import type { DreamwellCardId } from "../types/identifiers";

/** Log each shared tutorial presentation state once per playback run. */
export function useTutorialPresentationLogging(
  playback: TutorialPlaybackState | null,
  view: TutorialView,
  featuredDreamwellCardId: DreamwellCardId,
  playbackSpeed = 1,
): void {
  const loggedActionKey = useRef<string | null>(null);
  const loggedPlayerTurnRunId = useRef<string | null>(null);

  useEffect(() => {
    if (
      view.battle.activeSide !== "player" ||
      view.playbackRunId === null ||
      loggedPlayerTurnRunId.current === view.playbackRunId
    ) {
      return;
    }
    loggedPlayerTurnRunId.current = view.playbackRunId;
    const drawnCard = view.battle.playerHand[0];
    logEvent("tutorial_player_turn_presented", {
      runId: view.playbackRunId,
      battleId: view.battle.battleId,
      activeSide: view.battle.activeSide,
      currentEnergy: view.battle.player.status.currentEnergy,
      maxEnergy: view.battle.player.status.maxEnergy,
      cardId: drawnCard?.model.cardId ?? null,
      cardInstanceId: drawnCard?.id ?? null,
      sourceZone: "player-deck",
      destinationZone: "player-hand",
      playerDeckCount: view.battle.player.deckCardIds.length,
      playerHandCount: view.battle.playerHand.length,
      tutorialPlaybackSpeed: playbackSpeed,
    });
  }, [playbackSpeed, view]);

  useEffect(() => {
    const current = view.currentAction;
    if (current === null || view.playbackRunId === null) return;
    const key = `${view.playbackRunId}:${current.id}`;
    if (loggedActionKey.current === key) return;
    loggedActionKey.current = key;
    logEvent("tutorial_action_presented", {
      runId: view.playbackRunId,
      ...tutorialActionLogDetails(current, featuredDreamwellCardId),
      ...(current.action === "resolve-challenge" &&
      view.challenge !== null &&
      view.challenge !== undefined
        ? {
            winnerCardId:
              view.challenge?.winnerOwner === view.challenge?.challenger.owner
                ? view.challenge?.challenger.card.model.cardId
                : view.challenge?.blocker.card.model.cardId,
            winnerSpark:
              view.challenge?.winnerOwner === view.challenge?.challenger.owner
                ? view.challenge?.challenger.spark
                : view.challenge?.blocker.spark,
            loserCardId:
              view.challenge?.loserOwner === view.challenge?.challenger.owner
                ? view.challenge?.challenger.card.model.cardId
                : view.challenge?.blocker.card.model.cardId,
            loserSpark:
              view.challenge?.loserOwner === view.challenge?.challenger.owner
                ? view.challenge?.challenger.spark
                : view.challenge?.blocker.spark,
            loserOwner: view.challenge?.loserOwner,
            loserDestinationZone: `${view.challenge?.loserOwner ?? "unknown"}-void`,
          }
        : {}),
      dialogueVisible: view.dialogue !== null,
      dialogueText:
        view.dialogue === null
          ? null
          : view.dialogue.kind === "guide"
            ? view.dialogue.model.text
            : view.dialogue.text,
      actionIndex: playback?.currentActionIndex ?? null,
      actionCount: playback?.actions.length ?? 0,
      tutorialPlaybackSpeed: playbackSpeed,
    });
  }, [
    playback,
    playbackSpeed,
    featuredDreamwellCardId,
    view.currentAction,
    view.dialogue,
    view.playbackRunId,
  ]);
}

/** Log the authored How to Play action's local presentation lifecycle. */
export function useTutorialHowToPlayLogging(
  battleId: BattleId,
): Pick<TutorialScreenProps, "onHowToPlayPresented" | "onHowToPlayDismissed"> {
  const onHowToPlayPresented = useCallback(
    (
      runId: TutorialRunId,
      actionId: TutorialActionId,
      trigger: TutorialHowToPlayTrigger,
    ): void => {
      logEvent("tutorial_how_to_play_presented", {
        runId,
        actionId,
        battleId,
        trigger,
        title: "How to Play",
      });
    },
    [battleId],
  );
  const onHowToPlayDismissed = useCallback(
    (
      runId: TutorialRunId,
      actionId: TutorialActionId,
      trigger: TutorialHowToPlayTrigger,
    ): void => {
      logEvent("tutorial_how_to_play_dismissed", {
        runId,
        actionId,
        battleId,
        trigger,
      });
    },
    [battleId],
  );
  return { onHowToPlayPresented, onHowToPlayDismissed };
}
