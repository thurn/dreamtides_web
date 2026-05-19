import type {
  BattleEngineEmissionContext,
  BattleFlowStep,
  BattleInit,
  BattleMutableState,
  BattleResultEvaluation,
  BattleTransitionData,
} from "../types";
import { cloneBattleMutableState } from "../state/create-initial-state";
import { createBattleLogBaseFields } from "../../logging";

export const AUTO_SYSTEM_EMISSION_CONTEXT: BattleEngineEmissionContext = {
  sourceSurface: "auto-system",
  selectedCardId: null,
};

export const AUTO_AI_EMISSION_CONTEXT: BattleEngineEmissionContext = {
  sourceSurface: "auto-ai",
  selectedCardId: null,
};

/**
 * Builds the `battle_proto_result_changed` payload. Carries the six common
 * log fields (per spec §L L-4) plus the result-specific `winner`,
 * `playerScore`, `enemyScore`, and `reason` fields (per L-6).
 *
 * This single event satisfies the L-7 "battle won/lost/drawn" logging
 * requirement: `result` is "victory" | "defeat" | "draw" | null, and
 * downstream log consumers disambiguate by `result` + `winner`. Natural and
 * FORCE_RESULT-driven terminal states all go through this event with the
 * appropriate `reason` field (see bug-044).
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

export function evaluateBattleResult(
  state: BattleMutableState,
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
): BattleResultEvaluation {
  if (state.forcedResult !== null) {
    return {
      result: state.forcedResult,
      reason: "forced_result",
    };
  }

  const playerAtTarget = state.sides.player.score >= battleInit.scoreToWin;
  const enemyAtTarget = state.sides.enemy.score >= battleInit.scoreToWin;

  if (playerAtTarget && enemyAtTarget) {
    if (state.sides.player.score > state.sides.enemy.score) {
      return {
        result: "victory",
        reason: "score_target_reached",
      };
    }

    if (state.sides.enemy.score > state.sides.player.score) {
      return {
        result: "defeat",
        reason: "score_target_reached",
      };
    }

    return {
      result: "draw",
      reason: "score_target_reached",
    };
  }

  if (playerAtTarget) {
    return {
      result: "victory",
      reason: "score_target_reached",
    };
  }

  if (enemyAtTarget) {
    return {
      result: "defeat",
      reason: "score_target_reached",
    };
  }

  if (isTurnLimitReached(state, battleInit)) {
    return {
      result: "draw",
      reason: "turn_limit_reached",
    };
  }

  return {
    result: null,
    reason: null,
  };
}

export function applyBattleResult(
  state: BattleMutableState,
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  evaluation: BattleResultEvaluation;
  transition: BattleTransitionData;
} {
  const evaluation = evaluateBattleResult(state, battleInit);
  if (state.result === evaluation.result) {
    return {
      state,
      evaluation,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  nextState.result = evaluation.result;

  return {
    state: nextState,
    evaluation,
    transition: {
      ...createEmptyTransitionData(),
      resultChange: {
        at: createFlowStep(state.activeSide, state.phase),
        previousResult: state.result,
        result: evaluation.result,
        reason: evaluation.reason,
      },
      logEvents: [
        {
          event: "battle_proto_result_changed",
          fields: createBattleResultChangedLogFields(
            nextState,
            state.result,
            evaluation,
            state.phase,
            context,
          ),
        },
      ],
    },
  };
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

function isTurnLimitReached(
  state: BattleMutableState,
  battleInit: Pick<BattleInit, "turnLimit">,
): boolean {
  // D-8: draw after `turnLimit` full turns. The primary gate catches the
  // expected trigger point (end-of-turn on the enemy side of turn 50).
  // bug-035: the strict-inequality backstop ensures any path that evaluates
  // result *past* the limit (e.g. mid-judgment of a later turn) still draws
  // rather than silently continuing.
  if (state.turnNumber > battleInit.turnLimit) {
    return true;
  }

  return (
    state.activeSide === "enemy" &&
    (state.phase === "ending" || state.phase === "endOfTurn") &&
    state.turnNumber >= battleInit.turnLimit
  );
}
