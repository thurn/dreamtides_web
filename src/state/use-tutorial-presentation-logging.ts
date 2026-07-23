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

/** Log each shared tutorial presentation state once per playback run. */
export function useTutorialPresentationLogging(
  playback: TutorialPlaybackState | null,
  view: TutorialView,
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
    });
  }, [view]);

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
      actionIndex: playback?.currentActionIndex ?? null,
      actionCount: playback?.actions.length ?? 0,
    });
  }, [playback, view.currentAction, view.dialogue, view.playbackRunId]);
}

/** Log the authored How to Play action's local presentation lifecycle. */
export function useTutorialHowToPlayLogging(
  battleId: string,
): Pick<
  TutorialScreenProps,
  "onHowToPlayPresented" | "onHowToPlayDismissed"
> {
  const onHowToPlayPresented = useCallback(
    (
      runId: string,
      actionId: string,
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
      runId: string,
      actionId: string,
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
