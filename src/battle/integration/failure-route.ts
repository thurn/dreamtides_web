import { logEvent } from "../../logging";
import type { JourneyMutations } from "../../state/journey-context";
import type {
  JourneyFailureBattleResult,
  JourneyFailureReason,
  JourneyFailureSummary,
} from "../../types/journey";
import type { BattleInit, BattleMutableState } from "../types";

export interface FreezeJourneyFailureSummaryInput {
  battleInit: Pick<BattleInit, "battleId" | "siteId" | "dreamscapeId">;
  mutableState: Pick<BattleMutableState, "turnNumber" | "sides">;
  result: JourneyFailureBattleResult;
  reason: JourneyFailureReason;
  siteLabel: string;
}

export interface BeginJourneyFailureRouteInput extends FreezeJourneyFailureSummaryInput {
  mutations: Pick<JourneyMutations, "setFailureSummary" | "setScreen">;
  clearBattleStateForRoom?: () => void;
}

export function freezeJourneyFailureSummary(
  input: FreezeJourneyFailureSummaryInput,
): JourneyFailureSummary {
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
 * Freezes a {@link JourneyFailureSummary} from the live battle state and routes
 * to the `journeyFailed` screen. Intentionally does NOT call `resetJourney()` —
 * ownership of that call belongs to `JourneyFailedScreen`.
 */
export function beginJourneyFailureRoute(
  input: BeginJourneyFailureRouteInput,
): JourneyFailureSummary {
  const summary = freezeJourneyFailureSummary(input);
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
  input.mutations.setScreen({ type: "journeyFailed" });
  if (typeof input.clearBattleStateForRoom === "function") {
    input.clearBattleStateForRoom();
  }
  return summary;
}
