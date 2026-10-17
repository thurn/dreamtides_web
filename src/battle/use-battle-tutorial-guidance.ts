import { currentTutorialPresentation } from "../rules/battle/tutorial-checkpoints";
import { useCallback, useEffect, useMemo } from "react";
import { useActions, useClientId, useGameState } from "../session/hooks";
import { logEvent } from "../logging";
import {
  isAutomaticOpponentPlayGuidance,
  tutorialGuidanceMessageDurationSeconds,
} from "./tutorial-presentation-timing";
import { parseIntentKey } from "../types/identifiers";
import { battleGuidanceOf } from "../rules/battle/journey-tutorial-guidance";

export interface BattleTutorialGuidanceController {
  readonly advance: () => void;
  readonly completeDuration: () => void;
}

/** Shared timer/manual bridge for one event-log-owned Mira battle tutorial. */
export function useBattleTutorialGuidance(presentationVisible = true): BattleTutorialGuidanceController {
  const state = useGameState();
  const actions = useActions();
  const clientId = useClientId();
  const battle = useMemo(() => battleGuidanceOf(state.battle), [state.battle]);
  const presentation = currentTutorialPresentation(battle);
  const guidance =
    presentation?.kind === "tutorial-guidance" ? presentation : null;
  const submitAdvance = useCallback(
    (reason: "timer" | "manual") => {
      if (guidance === null || battle === null) return;
      const message = guidance.messages[guidance.messageIndex];
      if (message === undefined) return;
      logEvent("battle_tutorial_guidance_advance_requested", {
        battleId: battle.init.battleId,
        presentationId: guidance.id,
        triggerId: message.triggerId,
        messageIndex: guidance.messageIndex,
        reason,
        source: guidance.source,
      });
      void actions
        .completeTutorialBattlePresentation(
          guidance.id,
          parseIntentKey(
            `battle-tutorial:${guidance.id}:${String(guidance.messageIndex)}`,
          ),
          clientId,
          guidance.messageIndex,
        )
        .catch(() => undefined);
    },
    [actions, battle, clientId, guidance],
  );

  useEffect(() => {
    if (!presentationVisible || guidance === null || battle === null) return;
    logEvent("battle_tutorial_guidance_presented", {
      battleId: battle.init.battleId,
      presentationId: guidance.id,
      source: guidance.source,
      triggerIds: guidance.messages.map((message) => message.triggerId),
      speakers: guidance.messages.map((message) => message.speaker),
      delays: guidance.messages.map((message) => message.delay ?? 0),
      durations: guidance.messages.map((message) => message.duration),
      effectiveDurations: guidance.messages.map((_, messageIndex) =>
        tutorialGuidanceMessageDurationSeconds({
          ...guidance,
          messageIndex,
        }),
      ),
      satisfiesOpponentPlayReveal: isAutomaticOpponentPlayGuidance(guidance),
      verticalOffsets: guidance.messages.map(
        (message) => message.verticalOffset,
      ),
      bubbleWidths: guidance.messages.map((message) => message.bubbleWidth),
      messageIndex: guidance.messageIndex,
    });
  }, [battle, guidance, presentationVisible]);

  return {
    advance: () => submitAdvance("manual"),
    completeDuration: () => submitAdvance("timer"),
  };
}
