import { logEvent } from "../../logging";
import type { QuestMutations } from "../../state/quest-context";
import type {
  QuestFailureBattleResult,
  QuestFailureReason,
  QuestFailureSummary,
} from "../../types/quest";
import type { BattleInit, BattleMutableState } from "../types";

export interface FreezeQuestFailureSummaryInput {
  battleInit: Pick<BattleInit, "battleId" | "siteId" | "dreamscapeId">;
  mutableState: Pick<BattleMutableState, "turnNumber" | "sides">;
  result: QuestFailureBattleResult;
  reason: QuestFailureReason;
  siteLabel: string;
}

export interface BeginQuestFailureRouteInput extends FreezeQuestFailureSummaryInput {
  mutations: Pick<QuestMutations, "setFailureSummary" | "setScreen">;
  clearBattleStateForRoom?: () => void;
}

export function freezeQuestFailureSummary(
  input: FreezeQuestFailureSummaryInput,
): QuestFailureSummary {
  return {
    battleId: input.battleInit.battleId,
    result: input.result,
    reason: input.reason,
    siteId: input.battleInit.siteId,
    siteLabel: input.siteLabel,
    dreamscapeIdOrNone: input.battleInit.dreamscapeId,
    turnNumber: input.mutableState.turnNumber,
    playerScore: input.mutableState.sides.player.score,
    enemyScore: input.mutableState.sides.enemy.score,
  };
}

/**
 * Freezes a {@link QuestFailureSummary} from the live battle state and routes
 * to the `questFailed` screen. Intentionally does NOT call `resetQuest()` —
 * ownership of that call belongs to `QuestFailedScreen`.
 */
export function beginQuestFailureRoute(
  input: BeginQuestFailureRouteInput,
): QuestFailureSummary {
  const summary = freezeQuestFailureSummary(input);
  logEvent("battle_proto_failure_route_begin", {
    battleId: summary.battleId,
    result: summary.result,
    reason: summary.reason,
    siteId: summary.siteId,
    dreamscapeIdOrNone: summary.dreamscapeIdOrNone,
    turnNumber: summary.turnNumber,
    playerScore: summary.playerScore,
    enemyScore: summary.enemyScore,
  });
  input.mutations.setFailureSummary(summary, "battle_failure_confirmed");
  input.mutations.setScreen({ type: "questFailed" });
  if (typeof input.clearBattleStateForRoom === "function") {
    input.clearBattleStateForRoom();
  }
  return summary;
}
