import {
  AUTO_AI_EMISSION_CONTEXT,
  applyBattleResult,
  createEmptyTransitionData,
} from "../engine/result";
import { advanceAfterEndTurn } from "../engine/turn-flow";
import { resolveMoveCard, resolvePlayCard } from "../engine/play-card";
import { chooseAiAction } from "./choose-action";
import type {
  BattleAiChoiceTrace,
  BattleEngineEmissionContext,
  BattleInit,
  BattleMutableState,
  BattleTransitionData,
} from "../types";
import { createBattleLogBaseFields } from "../../logging";

/**
 * Spec "AI Detail" loop guard cap. The AI evaluates Day actions in a
 * fixed four-stage pipeline (`choose-action.ts:chooseAiAction`): character
 * play → reposition → single event → end turn. Three distinct productive
 * actions can fire in a single turn (character play, reposition, and the one
 * event allowed per spec); the fourth stage is always END_TURN. The cap is
 * intentionally sized at 3 to bound worst-case looping even if one of the
 * stages is retried — any `chooseAiAction` call that doesn't advance progress
 * would return END_TURN and exit the loop earlier.
 */
export const MAX_AI_ACTIONS_PER_TURN = 3;

export function runAiTurn(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (
    state.result !== null ||
    state.activeSide !== "enemy" ||
    (state.phase !== "day" && state.phase !== "main")
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  let nextState = state;
  let transition = createEmptyTransitionData();
  let loggedEndTurnChoice = false;
  const progress = {
    hasPlayedCharacter: false,
    hasPlayedNonCharacter: false,
    hasRepositioned: false,
  };

  for (let actionCount = 0; actionCount < MAX_AI_ACTIONS_PER_TURN; actionCount += 1) {
    const decision = chooseAiAction(nextState, progress);
    transition = mergeTransitions(
      transition,
      createAiChoiceTransition(nextState, decision.trace),
    );

    if (decision.type === "END_TURN") {
      loggedEndTurnChoice = true;
      break;
    }

    const resolved = decision.type === "PLAY_CARD"
      ? resolvePlayCard(nextState, decision.battleCardId, decision.target, AUTO_AI_EMISSION_CONTEXT)
      : resolveMoveCard(nextState, decision.battleCardId, decision.target, AUTO_AI_EMISSION_CONTEXT);
    // Engine rejection contract (resolvePlayCard / resolveMoveCard in
    // `engine/play-card.ts`): on any validation failure the resolver returns
    // the input `state` object by identity — a fresh clone is only produced
    // on success. This equality check lets the AI loop treat rejection as an
    // END_TURN without needing a wrapper sentinel.
    if (resolved.state === nextState) {
      loggedEndTurnChoice = true;
      transition = mergeTransitions(
        transition,
        createAiChoiceTransition(nextState, {
          stage: "endTurn",
          choice: "END_TURN",
          battleCardId: null,
          cardName: null,
          sourceHandIndex: null,
          sourceSlotId: null,
          targetSlotId: null,
          heuristicScoreBefore: null,
          heuristicScoreAfter: null,
        }),
      );
      break;
    }

    const withResult = applyBattleResult(resolved.state, battleInit, AUTO_AI_EMISSION_CONTEXT);
    nextState = withResult.state;
    transition = mergeTransitions(
      transition,
      mergeTransitions(resolved.transition, withResult.transition),
    );

    if (decision.trace.stage === "character") {
      progress.hasPlayedCharacter = true;
    }
    if (decision.trace.stage === "reposition") {
      progress.hasRepositioned = true;
    }
    if (decision.trace.stage === "nonCharacter") {
      progress.hasPlayedNonCharacter = true;
    }

    if (nextState.result !== null) {
      return {
        state: nextState,
        transition,
      };
    }
  }

  if (!loggedEndTurnChoice) {
    transition = mergeTransitions(
      transition,
      createAiChoiceTransition(nextState, {
        stage: "endTurn",
        choice: "END_TURN",
        battleCardId: null,
        cardName: null,
        sourceHandIndex: null,
        sourceSlotId: null,
        targetSlotId: null,
        heuristicScoreBefore: null,
        heuristicScoreAfter: null,
      }),
    );
  }

  const endedTurn = advanceAfterEndTurn(nextState, battleInit, AUTO_AI_EMISSION_CONTEXT);
  return {
    state: endedTurn.state,
    transition: mergeTransitions(transition, endedTurn.transition),
  };
}

function createAiChoiceTransition(
  state: BattleMutableState,
  trace: BattleAiChoiceTrace,
): BattleTransitionData {
  const aiContext: BattleEngineEmissionContext = {
    sourceSurface: AUTO_AI_EMISSION_CONTEXT.sourceSurface,
    selectedCardId: trace.battleCardId,
  };
  return {
    ...createEmptyTransitionData(),
    aiChoices: [{ ...trace }],
    logEvents: [
      {
        event: "battle_proto_ai_choice",
        fields: {
          ...createBattleLogBaseFields(state, aiContext),
          battleCardId: trace.battleCardId,
          cardName: trace.cardName,
          choice: trace.choice,
          heuristicScoreAfter: trace.heuristicScoreAfter,
          heuristicScoreBefore: trace.heuristicScoreBefore,
          sourceHandIndex: trace.sourceHandIndex,
          sourceSlotId: trace.sourceSlotId,
          stage: trace.stage,
          targetSlotId: trace.targetSlotId,
        },
      },
    ],
  };
}

function mergeTransitions(
  left: BattleTransitionData,
  right: BattleTransitionData,
): BattleTransitionData {
  return {
    steps: [...left.steps, ...right.steps],
    energyChanges: [...left.energyChanges, ...right.energyChanges],
    judgment: right.judgment ?? left.judgment,
    scoreChanges: [...left.scoreChanges, ...right.scoreChanges],
    resultChange: right.resultChange ?? left.resultChange,
    aiChoices: [...left.aiChoices, ...right.aiChoices],
    logEvents: [...left.logEvents, ...right.logEvents],
  };
}
