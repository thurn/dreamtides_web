import { useCallback, useEffect } from "react";
import { useActions, useClientId, useConfirmedGameState } from "../coop/hooks";
import { logEvent } from "../logging";
import {
  isAutomaticOpponentPlayGuidance,
  tutorialGuidanceMessageDurationSeconds,
} from "./tutorial-presentation-timing";

export interface BattleTutorialGuidanceController {
  readonly advance: () => void;
  readonly completeDuration: () => void;
}

/** Shared timer/manual bridge for one event-log-owned Mira battle tutorial. */
export function useBattleTutorialGuidance(): BattleTutorialGuidanceController {
  const state = useConfirmedGameState();
  const actions = useActions();
  const clientId = useClientId();
  const presentation = state.battle?.tutorialPresentation;
  const guidance =
    presentation?.kind === "tutorial-guidance" ? presentation : null;
  const submitAdvance = useCallback(
    (reason: "timer" | "manual") => {
      if (guidance === null || state.battle === null) return;
      const message = guidance.messages[guidance.messageIndex];
      if (message === undefined) return;
      logEvent("battle_tutorial_guidance_advance_requested", {
        battleId: state.battle.board.battleId,
        presentationId: guidance.id,
        triggerId: message.triggerId,
        messageIndex: guidance.messageIndex,
        reason,
        source: guidance.source,
      });
      void actions
        .completeTutorialBattlePresentation(
          guidance.id,
          `battle-tutorial:${guidance.id}:${String(guidance.messageIndex)}`,
          clientId,
          guidance.messageIndex,
        )
        .catch(() => undefined);
    },
    [actions, clientId, guidance, state.battle],
  );

  useEffect(() => {
    if (guidance === null || state.battle === null) return;
    logEvent("battle_tutorial_guidance_presented", {
      battleId: state.battle.board.battleId,
      presentationId: guidance.id,
      source: guidance.source,
      triggerIds: guidance.messages.map((message) => message.triggerId),
      speakers: guidance.messages.map((message) => message.speaker),
      durations: guidance.messages.map((message) => message.duration),
      effectiveDurations: guidance.messages.map((_, messageIndex) =>
        tutorialGuidanceMessageDurationSeconds({
          ...guidance,
          messageIndex,
        }),
      ),
      satisfiesOpponentPlayReveal:
        isAutomaticOpponentPlayGuidance(guidance),
      verticalOffsets: guidance.messages.map(
        (message) => message.verticalOffset,
      ),
      bubbleWidths: guidance.messages.map((message) => message.bubbleWidth),
      messageIndex: guidance.messageIndex,
    });
  }, [guidance, state.battle]);

  return {
    advance: () => submitAdvance("manual"),
    completeDuration: () => submitAdvance("timer"),
  };
}
