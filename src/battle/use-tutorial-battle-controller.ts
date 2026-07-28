import { useCallback, useEffect, useMemo, useState } from "react";
import { logEvent } from "../logging";
import {
  useActions,
  useClientId,
  useConfirmedGameState,
  useConnectedClientIds,
} from "../coop/hooks";
import type { BattleFoldState } from "../rules/battle/fold";
import {
  planTutorialBattleController,
  type TutorialAutomaticIntent,
  type TutorialBattleControllerPlan,
} from "./tutorial-battle-controller";
import {
  TUTORIAL_CHALLENGE_PRESENTATION_DWELL_MS,
  TUTORIAL_OPPONENT_PLAY_REVEAL_DWELL_MS,
} from "./tutorial-presentation-timing";

/** Fixed readable dwell for each persisted tutorial reveal. */
export const TUTORIAL_BATTLE_PRESENTATION_DWELL_MS = 3_000;

export interface TutorialBattleControllerRuntime
  extends TutorialBattleControllerPlan {
  readonly onPresentationVisible: (presentationId: string) => void;
}

/**
 * Dwells for the paced Challenge beats. Each one holds a board the player is
 * already looking at rather than introducing a card to read, so they are
 * shorter than the reveal dwell: long enough for the shared-layout travel to
 * finish and register, short enough not to stall the turn.
 */
const PRESENTATION_DWELL_MS: Readonly<
  Partial<Record<NonNullable<BattleFoldState["tutorialPresentation"]>["kind"], number>>
> = {
  "opponent-play": TUTORIAL_OPPONENT_PLAY_REVEAL_DWELL_MS,
  "opponent-block": 2_000,
  "challenge-resolved": TUTORIAL_CHALLENGE_PRESENTATION_DWELL_MS,
};

/** The dwell this presentation is held for before automation resumes. */
export function tutorialBattlePresentationDwellMs(
  presentation: BattleFoldState["tutorialPresentation"],
): number {
  if (presentation === null || presentation === undefined) {
    return TUTORIAL_BATTLE_PRESENTATION_DWELL_MS;
  }
  return (
    PRESENTATION_DWELL_MS[presentation.kind] ??
      TUTORIAL_BATTLE_PRESENTATION_DWELL_MS
  );
}

/**
 * React bridge for the pure tutorial controller. It reads only the committed
 * fold and submits normal coop intents; the room log remains the sole flow
 * authority and intent keys absorb StrictMode/remount/reload duplicates.
 */
export function useTutorialBattleController(): TutorialBattleControllerRuntime {
  const state = useConfirmedGameState();
  const clientId = useClientId();
  const connectedClientIds = useConnectedClientIds();
  const actions = useActions();
  const [visiblePresentationId, setVisiblePresentationId] =
    useState<string | null>(null);
  const onPresentationVisible = useCallback((presentationId: string) => {
    setVisiblePresentationId(presentationId);
  }, []);
  const plan = useMemo(
    () => planTutorialBattleController({ state, clientId, connectedClientIds }),
    [state, clientId, connectedClientIds],
  );

  useEffect(() => {
    if (plan.status !== "driver" || plan.intent === null) return;
    const intent = plan.intent;
    const battle = state.battle;
    if (battle === null) return;
    logTutorialIntent(battle.board.battleId, clientId, intent);
    const actor = `tutorial-ai:${clientId}`;
    switch (intent.kind) {
      case "complete-presentation": {
        if (battle.tutorialPresentation?.kind === "tutorial-guidance") return;
        if (intent.presentationId !== visiblePresentationId) return;
        const dwellMs = tutorialBattlePresentationDwellMs(
          battle.tutorialPresentation,
        );
        logEvent("tutorial_battle_presentation_dwell_started", {
          battleId: battle.board.battleId,
          presentationId: intent.presentationId,
          presentation: battle.tutorialPresentation,
          dwellMs,
          reason: intent.reason,
        });
        const timeout = window.setTimeout(() => {
          logEvent("tutorial_battle_presentation_dwell_elapsed", {
            battleId: battle.board.battleId,
            presentationId: intent.presentationId,
            presentation: battle.tutorialPresentation,
            dwellMs,
            reason: intent.reason,
          });
          void actions.completeTutorialBattlePresentation(
            intent.presentationId,
            intent.intentKey,
            actor,
          ).catch(() => undefined);
        }, dwellMs);
        return () => window.clearTimeout(timeout);
      }
      case "battle-command":
        void actions.battleCommand(intent.command, intent.intentKey, actor).catch(() => undefined);
        return;
      case "battle-play-card":
        void actions.battlePlayCard(
          intent.battleCardId,
          intent.targetBattleCardIds,
          intent.intentKey,
          actor,
          intent.aiChoices,
          intent.characterDestination,
          intent.tutorialAiActionOverrideId,
        ).catch(() => undefined);
        return;
      case "battle-gesture":
        void actions.battleGesture(intent.commands, intent.intentKey, actor).catch(() => undefined);
        return;
      case "battle-ai-defend":
        void actions.battleAiDefend("enemy", actor, intent.intentKey).catch(() => undefined);
        return;
      case "resolve-prompt":
        void actions.resolvePrompt(
          intent.promptId,
          intent.resolution,
          intent.intentKey,
          actor,
        ).catch(() => undefined);
        return;
    }
  }, [actions, clientId, plan, state.battle, visiblePresentationId]);

  return useMemo(
    () => ({ ...plan, onPresentationVisible }),
    [onPresentationVisible, plan],
  );
}

function logTutorialIntent(
  battleId: string,
  driverClientId: string,
  intent: TutorialAutomaticIntent,
): void {
  logEvent("tutorial_battle_automatic_intent_planned", {
    battleId,
    driverClientId,
    intentKey: intent.intentKey,
    intentKind: intent.kind,
    reason: intent.reason,
    aiActionOverrideMiss: intent.aiActionOverrideMiss ?? null,
    ...(intent.kind === "battle-play-card"
      ? {
        battleCardId: intent.battleCardId,
        targetBattleCardIds: intent.targetBattleCardIds,
        aiChoices: intent.aiChoices,
        characterDestination: intent.characterDestination ?? null,
        tutorialAiActionOverrideId:
          intent.tutorialAiActionOverrideId ?? null,
      }
      : {}),
    ...(intent.kind === "resolve-prompt"
      ? { promptId: intent.promptId, resolution: intent.resolution }
      : {}),
    ...(intent.kind === "battle-ai-defend"
      ? { defenseDecision: intent.decision }
      : {}),
    ...(intent.kind === "complete-presentation"
      ? { presentationId: intent.presentationId }
      : {}),
  });
}
