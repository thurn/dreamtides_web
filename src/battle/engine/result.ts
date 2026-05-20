import type {
  BattleEngineEmissionContext,
  BattleFlowStep,
  BattleMutableState,
  BattleResultEvaluation,
  BattleTransitionData,
} from "../types";
import { createBattleLogBaseFields } from "../../logging";

/**
 * Builds the `battle_proto_result_changed` payload. Carries the six common
 * log fields (per spec §L L-4) plus the result-specific `winner`,
 * `playerScore`, `enemyScore`, and `reason` fields (per L-6).
 *
 * The battle outcome is manual: `result` changes only through the
 * `FORCE_RESULT` / `SKIP_TO_REWARDS` controls, so every emission carries the
 * `forced_result` reason. Downstream log consumers disambiguate by `result`
 * + `winner`.
 */
export function createBattleResultChangedLogFields(
  state: BattleMutableState,
  previousResult: BattleMutableState["result"],
  evaluation: BattleResultEvaluation,
  phase: BattleMutableState["phase"],
  context: BattleEngineEmissionContext,
): Record<string, unknown> {
  return {
    ...createBattleLogBaseFields(
      { ...state, phase },
      context,
    ),
    previousResult,
    reason: evaluation.reason,
    result: evaluation.result,
    winner: resolveBattleWinner(state, evaluation),
    playerScore: state.sides.player.score,
    enemyScore: state.sides.enemy.score,
  };
}

function resolveBattleWinner(
  state: BattleMutableState,
  evaluation: BattleResultEvaluation,
): "player" | "enemy" | null {
  switch (evaluation.result) {
    case "victory":
      return state.sides.player.score >= state.sides.enemy.score ? "player" : "enemy";
    case "defeat":
      return state.sides.enemy.score >= state.sides.player.score ? "enemy" : "player";
    case "draw":
    case null:
      return null;
  }
}

export function createEmptyTransitionData(): BattleTransitionData {
  return {
    steps: [],
    energyChanges: [],
    judgment: null,
    scoreChanges: [],
    resultChange: null,
    aiChoices: [],
    logEvents: [],
  };
}

export function createFlowStep(
  side: BattleFlowStep["side"],
  phase: BattleFlowStep["phase"],
): BattleFlowStep {
  return {
    side,
    phase,
  };
}
