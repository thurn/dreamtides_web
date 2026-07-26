import { useEffect, useMemo } from "react";
import { logEvent } from "../logging";
import {
  useActions,
  useClientId,
  useConfirmedGameState,
  useConnectedClientIds,
} from "../coop/hooks";
import {
  planTutorialBattleController,
  type TutorialAutomaticIntent,
  type TutorialBattleControllerPlan,
} from "./tutorial-battle-controller";

/**
 * React bridge for the pure tutorial controller. It reads only the committed
 * fold and submits normal coop intents; the room log remains the sole flow
 * authority and intent keys absorb StrictMode/remount/reload duplicates.
 */
export function useTutorialBattleController(): TutorialBattleControllerPlan {
  const state = useConfirmedGameState();
  const clientId = useClientId();
  const connectedClientIds = useConnectedClientIds();
  const actions = useActions();
  const plan = useMemo(
    () => planTutorialBattleController({ state, clientId, connectedClientIds }),
    [state, clientId, connectedClientIds],
  );

  useEffect(() => {
    if (plan.status !== "driver" || plan.intent === null) return;
    const battle = state.battle;
    if (battle === null) return;
    logTutorialIntent(battle.board.battleId, clientId, plan.intent);
    const actor = `tutorial-ai:${clientId}`;
    switch (plan.intent.kind) {
      case "battle-command":
        void actions.battleCommand(plan.intent.command, plan.intent.intentKey, actor).catch(() => undefined);
        return;
      case "battle-play-card":
        void actions.battlePlayCard(
          plan.intent.battleCardId,
          plan.intent.targetBattleCardIds,
          plan.intent.intentKey,
          actor,
          plan.intent.aiChoices,
        ).catch(() => undefined);
        return;
      case "battle-gesture":
        void actions.battleGesture(plan.intent.commands, plan.intent.intentKey, actor).catch(() => undefined);
        return;
      case "battle-ai-defend":
        void actions.battleAiDefend("enemy", actor, plan.intent.intentKey).catch(() => undefined);
        return;
      case "resolve-prompt":
        void actions.resolvePrompt(
          plan.intent.promptId,
          plan.intent.resolution,
          plan.intent.intentKey,
          actor,
        ).catch(() => undefined);
        return;
    }
  }, [actions, clientId, plan, state.battle]);

  return plan;
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
    ...(intent.kind === "battle-play-card"
      ? {
        battleCardId: intent.battleCardId,
        targetBattleCardIds: intent.targetBattleCardIds,
        aiChoices: intent.aiChoices,
      }
      : {}),
    ...(intent.kind === "resolve-prompt"
      ? { promptId: intent.promptId, resolution: intent.resolution }
      : {}),
    ...(intent.kind === "battle-ai-defend"
      ? { defenseDecision: intent.decision }
      : {}),
  });
}
