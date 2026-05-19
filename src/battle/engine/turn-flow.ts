import type {
  BattleEngineEmissionContext,
  BattleInit,
  BattleJudgmentResolution,
  BattleMutableState,
  BattleResultEvaluation,
  BattleSide,
  BattleTransitionData,
} from "../types";
import { DEPLOY_SLOT_IDS } from "../types";
import { cloneBattleMutableState } from "../state/create-initial-state";
import { applyJudgmentDissolutionsInPlace, resolveJudgment } from "./judgment";
import {
  AUTO_SYSTEM_EMISSION_CONTEXT,
  createBattleResultChangedLogFields,
  createEmptyTransitionData,
  createFlowStep,
  evaluateBattleResult,
} from "./result";
import {
  createBattleLogBaseFields,
  createBattleProtoExtraTurnConsumedLogEvent,
  createBattleProtoNoteExpiredLogEvent,
} from "../../logging";

const OPENING_ENERGY = 2;

/**
 * Prepares a freshly-initialized battle state for turn 1 by running the
 * Dawn composite for the starting side without incrementing the turn number.
 * Dawn refreshes energy, performs the draw step, and lands in Day.
 */
export function prepareInitialBattleState(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit" | "startingSide"
  >,
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  return runStartOfTurnComposite(
    state,
    battleInit,
    {
      side: battleInit.startingSide,
      incrementTurnNumber: false,
    },
    context,
  );
}

export function runStartOfTurnComposite(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
  options: {
    side: BattleSide;
    incrementTurnNumber: boolean;
  },
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const nextState = cloneBattleMutableState(state);
  const transition = createEmptyTransitionData();

  nextState.activeSide = options.side;
  if (options.incrementTurnNumber) {
    nextState.turnNumber += 1;
  }

  const dawnStep = setStep(nextState, transition, options.side, "dawn", context);
  expireBattleNotes(nextState, transition, context, {
    side: options.side,
    turnNumber: nextState.turnNumber,
  });
  const sideState = nextState.sides[options.side];
  const previousCurrentEnergy = sideState.currentEnergy;
  const previousMaxEnergy = sideState.maxEnergy;
  if (!shouldPreserveOpeningEnergy(nextState, options.side)) {
    sideState.maxEnergy = Math.min(sideState.maxEnergy + 1, battleInit.maxEnergyCap);
    sideState.currentEnergy = sideState.maxEnergy;
  }
  transition.energyChanges.push({
    at: dawnStep,
    side: options.side,
    previousCurrentEnergy,
    currentEnergy: sideState.currentEnergy,
    previousMaxEnergy,
    maxEnergy: sideState.maxEnergy,
  });
  transition.logEvents.push({
    event: "battle_proto_energy_changed",
    fields: {
      ...createBattleLogBaseFields(
        { ...nextState, phase: dawnStep.phase },
        context,
      ),
      currentEnergy: sideState.currentEnergy,
      currentEnergyDelta: sideState.currentEnergy - previousCurrentEnergy,
      maxEnergy: sideState.maxEnergy,
      maxEnergyDelta: sideState.maxEnergy - previousMaxEnergy,
      previousCurrentEnergy,
      previousMaxEnergy,
      side: options.side,
    },
  });

  if (!shouldSkipDraw(nextState, battleInit, options.side)) {
    drawTopCard(nextState, options.side);
  }

  if (applyEvaluatedResult(nextState, battleInit, transition, dawnStep, context)) {
    return {
      state: nextState,
      transition,
    };
  }

  setStep(nextState, transition, options.side, "day", context);
  return {
    state: nextState,
    transition,
  };
}

export function passBattlePhase(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (evaluateBattleResult(state, battleInit).result !== null) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  if (state.phase === "day" || state.phase === "main") {
    const nextState = cloneBattleMutableState(state);
    const transition = createEmptyTransitionData();
    setStep(nextState, transition, getOpposingSide(state.activeSide), "dusk", context);
    return { state: nextState, transition };
  }

  if (state.phase === "dusk") {
    const nextState = cloneBattleMutableState(state);
    const transition = createEmptyTransitionData();
    setStep(nextState, transition, getOpposingSide(state.activeSide), "night", context);
    return { state: nextState, transition };
  }

  if (state.phase === "night") {
    return advanceAfterEndTurn(state, battleInit, context);
  }

  return {
    state,
    transition: createEmptyTransitionData(),
  };
}

export function advanceAfterEndTurn(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (evaluateBattleResult(state, battleInit).result !== null) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  const transition = createEmptyTransitionData();
  const endingSide = state.phase === "dusk"
    ? getOpposingSide(nextState.activeSide)
    : nextState.activeSide;

  const challengeResult = buildJudgmentTransition(
    nextState,
    transition,
    endingSide,
    context,
    { advancePhase: true },
  );
  transition.judgment = challengeResult.judgment;
  transition.scoreChanges = challengeResult.scoreChanges;
  if (applyEvaluatedResult(nextState, battleInit, transition, challengeResult.judgmentStep, context)) {
    return {
      state: nextState,
      transition,
    };
  }

  const endingStep = setStep(nextState, transition, endingSide, "ending", context);
  if (applyEvaluatedResult(nextState, battleInit, transition, endingStep, context)) {
    return {
      state: nextState,
      transition,
    };
  }
  clearReserveRestrictions(nextState);

  const endingSidePendingExtraTurns = nextState.sides[endingSide].pendingExtraTurns;
  if (endingSidePendingExtraTurns > 0) {
    nextState.sides[endingSide].pendingExtraTurns = endingSidePendingExtraTurns - 1;
    const extraStartOfTurn = runStartOfTurnComposite(
      nextState,
      battleInit,
      {
        side: endingSide,
        incrementTurnNumber: false,
      },
      context,
    );
    transition.logEvents.push(
      createBattleProtoExtraTurnConsumedLogEvent(
        extraStartOfTurn.state,
        {
          consumedSide: endingSide,
          pendingExtraTurnsAfter: extraStartOfTurn.state.sides[endingSide].pendingExtraTurns,
        },
        context,
      ),
    );
    return {
      state: extraStartOfTurn.state,
      transition: {
        steps: [...transition.steps, ...extraStartOfTurn.transition.steps],
        energyChanges: [
          ...transition.energyChanges,
          ...extraStartOfTurn.transition.energyChanges,
        ],
        judgment: extraStartOfTurn.transition.judgment,
        scoreChanges: [
          ...transition.scoreChanges,
          ...extraStartOfTurn.transition.scoreChanges,
        ],
        resultChange: extraStartOfTurn.transition.resultChange,
        aiChoices: [],
        logEvents: [...transition.logEvents, ...extraStartOfTurn.transition.logEvents],
      },
    };
  }

  const pair = nextStartOfTurnPair(nextState);
  const startOfTurn = runStartOfTurnComposite(
    nextState,
    battleInit,
    {
      side: pair.side,
      incrementTurnNumber: endingSide === "enemy",
    },
    context,
  );
  return {
    state: startOfTurn.state,
    transition: {
      steps: [...transition.steps, ...startOfTurn.transition.steps],
      energyChanges: [...transition.energyChanges, ...startOfTurn.transition.energyChanges],
      judgment: startOfTurn.transition.judgment,
      scoreChanges: [...transition.scoreChanges, ...startOfTurn.transition.scoreChanges],
      resultChange: startOfTurn.transition.resultChange,
      aiChoices: [],
      logEvents: [...transition.logEvents, ...startOfTurn.transition.logEvents],
    },
  };
}

export function shouldSkipDraw(
  state: Pick<BattleMutableState, "turnNumber">,
  battleInit: Pick<BattleInit, "playerDrawSkipsTurnOne">,
  side: BattleSide,
): boolean {
  return side === "player" && battleInit.playerDrawSkipsTurnOne && state.turnNumber === 1;
}

function shouldPreserveOpeningEnergy(
  state: Pick<BattleMutableState, "turnNumber" | "sides">,
  side: BattleSide,
): boolean {
  const sideState = state.sides[side];
  return state.turnNumber === 1 &&
    sideState.currentEnergy === OPENING_ENERGY &&
    sideState.maxEnergy === OPENING_ENERGY;
}

function clearReserveRestrictions(state: BattleMutableState): void {
  for (const card of Object.values(state.cardInstances)) {
    if (card.enteredReserveTurnNumber !== null) {
      card.enteredReserveTurnNumber = null;
    }
  }
}

/**
 * Returns the `{ side, turnNumber }` pair that the next start-of-turn will
 * carry when `advanceAfterEndTurn` runs from the supplied state. Used both by
 * `advanceAfterEndTurn` itself and by UI surfaces (e.g. the note editor) that
 * need to predict the next start-of-turn without mutating state.
 */
export function nextStartOfTurnPair(
  state: Pick<BattleMutableState, "activeSide" | "turnNumber">,
): {
  side: BattleSide;
  turnNumber: number;
} {
  const endingSide = state.activeSide;
  const side = getOpposingSide(endingSide);
  const turnNumber = state.turnNumber + (endingSide === "enemy" ? 1 : 0);
  return { side, turnNumber };
}

export function drawTopCard(state: BattleMutableState, side: BattleSide): string | null {
  const battleCardId = state.sides[side].deck.shift() ?? null;
  if (battleCardId !== null) {
    state.sides[side].hand.push(battleCardId);
  }

  return battleCardId;
}

export function expireBattleNotes(
  state: BattleMutableState,
  transition: BattleTransitionData,
  context: BattleEngineEmissionContext,
  options: {
    side: BattleSide;
    turnNumber: number;
  },
): void {
  for (const battleCardId of Object.keys(state.cardInstances)) {
    const card = state.cardInstances[battleCardId];
    if (card.notes.length === 0) {
      continue;
    }
    const kept = [];
    const expired = [];
    for (const note of card.notes) {
      if (
        note.expiry.kind === "atStartOfTurn" &&
        note.expiry.side === options.side &&
        note.expiry.turnNumber === options.turnNumber
      ) {
        expired.push(note);
        continue;
      }
      kept.push(note);
    }

    if (expired.length === 0) {
      continue;
    }

    state.cardInstances[battleCardId].notes = kept;

    for (const note of expired) {
      if (note.expiry.kind !== "atStartOfTurn") {
        continue;
      }
      transition.logEvents.push(
        createBattleProtoNoteExpiredLogEvent(
          state,
          {
            battleCardId,
            noteId: note.noteId,
            expirySide: note.expiry.side,
            expiryTurnNumber: note.expiry.turnNumber,
          },
          context,
        ),
      );
    }
  }
}

/**
 * Resolves a Challenge step and pushes its transition artifacts onto `transition`.
 *
 * Shared between natural Challenge and the `FORCE_JUDGMENT` debug edit.
 * Mutates `nextState` (applies score deltas and dissolutions), appends the step
 * to `transition.steps`, and emits
 * the `battle_proto_judgment` + per-side `battle_proto_score_changed` log
 * events. When `options.advancePhase` is true, also mutates
 * `nextState.phase`/`nextState.activeSide` and emits `battle_proto_phase_changed`;
 * when false (forced judgment) phase and active side are left unchanged.
 *
 * The returned `scoreChanges`/`judgment`/`dissolvedCardIds` are for the caller
 * to place onto the outer transition (natural: onto the in-flight transition;
 * forced: onto a freshly built outer transition) plus emit any additional
 * caller-specific log events (e.g. `battle_proto_extra_judgment`).
 */
export function buildJudgmentTransition(
  nextState: BattleMutableState,
  transition: BattleTransitionData,
  side: BattleSide,
  context: BattleEngineEmissionContext,
  options: { advancePhase: boolean },
): {
  judgmentStep: ReturnType<typeof createFlowStep>;
  judgment: BattleJudgmentResolution;
  scoreChanges: BattleTransitionData["scoreChanges"];
  dissolvedCardIds: string[];
} {
  const judgmentStep = options.advancePhase
    ? setStep(nextState, transition, side, "challenge", context)
    : (() => {
        const step = createFlowStep(side, "challenge");
        transition.steps.push(step);
        return step;
      })();

  const judgment = resolveJudgment(nextState);
  // Spec D-10 / L-7: emit one per-lane event so log consumers can iterate
  // without decoding a nested array. The aggregate `battle_proto_judgment`
  // below is kept as a rollup for the UI (score totals, historical summary),
  // but the per-lane events are authoritative (bug-004).
  for (const lane of judgment.lanes) {
    transition.logEvents.push({
      event: "battle_proto_judgment_lane",
      fields: {
        ...createBattleLogBaseFields(
          { ...nextState, phase: judgmentStep.phase },
          context,
        ),
        enemySpark: lane.enemySpark,
        playerSpark: lane.playerSpark,
        scoreDelta: lane.scoreDelta,
        side: judgmentStep.side,
        slotId: lane.slotId,
        winner: lane.winner,
      },
    });
  }
  transition.logEvents.push({
    event: "battle_proto_judgment",
    fields: {
      ...createBattleLogBaseFields(
        { ...nextState, phase: judgmentStep.phase },
        context,
      ),
      enemyScoreDelta: judgment.enemyScoreDelta,
      lanes: judgment.lanes.map((lane) => ({
        enemySpark: lane.enemySpark,
        playerSpark: lane.playerSpark,
        scoreDelta: lane.scoreDelta,
        slotId: lane.slotId,
        winner: lane.winner,
      })),
      playerScoreDelta: judgment.playerScoreDelta,
      side: judgmentStep.side,
    },
  });

  const previousPlayerScore = nextState.sides.player.score;
  const previousEnemyScore = nextState.sides.enemy.score;
  const previousPlayerDeployed = { ...nextState.sides.player.deployed };
  const previousEnemyDeployed = { ...nextState.sides.enemy.deployed };
  nextState.sides.player.score += judgment.playerScoreDelta;
  nextState.sides.enemy.score += judgment.enemyScoreDelta;
  applyJudgmentDissolutionsInPlace(nextState);

  const dissolvedCardIds: string[] = [];
  for (const slotId of DEPLOY_SLOT_IDS) {
    const beforePlayer = previousPlayerDeployed[slotId];
    if (beforePlayer !== null && nextState.sides.player.deployed[slotId] === null) {
      dissolvedCardIds.push(beforePlayer);
    }
    const beforeEnemy = previousEnemyDeployed[slotId];
    if (beforeEnemy !== null && nextState.sides.enemy.deployed[slotId] === null) {
      dissolvedCardIds.push(beforeEnemy);
    }
  }

  const scoreChanges = buildScoreChanges(
    judgmentStep,
    previousPlayerScore,
    nextState.sides.player.score,
    previousEnemyScore,
    nextState.sides.enemy.score,
  );
  transition.logEvents.push(
    ...scoreChanges.map((change) => ({
      event: "battle_proto_score_changed",
      fields: {
        ...createBattleLogBaseFields(
          { ...nextState, phase: change.at.phase },
          context,
        ),
        delta: change.delta,
        previousScore: change.previousScore,
        score: change.score,
        side: change.side,
      },
    })),
  );

  return { judgmentStep, judgment, scoreChanges, dissolvedCardIds };
}

function getOpposingSide(side: BattleSide): BattleSide {
  return side === "player" ? "enemy" : "player";
}

function setStep(
  state: BattleMutableState,
  transition: BattleTransitionData,
  side: BattleSide,
  phase: BattleMutableState["phase"],
  context: BattleEngineEmissionContext,
) {
  state.activeSide = side;
  state.phase = phase;
  const step = createFlowStep(side, phase);
  transition.steps.push(step);
  transition.logEvents.push({
    event: "battle_proto_phase_changed",
    fields: {
      ...createBattleLogBaseFields(state, context),
      side,
    },
  });
  return step;
}

function buildScoreChanges(
  at: ReturnType<typeof createFlowStep>,
  previousPlayerScore: number,
  playerScore: number,
  previousEnemyScore: number,
  enemyScore: number,
): BattleTransitionData["scoreChanges"] {
  const scoreChanges = [];

  if (playerScore !== previousPlayerScore) {
    scoreChanges.push({
      at,
      side: "player" as const,
      previousScore: previousPlayerScore,
      score: playerScore,
      delta: playerScore - previousPlayerScore,
    });
  }

  if (enemyScore !== previousEnemyScore) {
    scoreChanges.push({
      at,
      side: "enemy" as const,
      previousScore: previousEnemyScore,
      score: enemyScore,
      delta: enemyScore - previousEnemyScore,
    });
  }

  return scoreChanges;
}

function applyEvaluatedResult(
  state: BattleMutableState,
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
  transition: BattleTransitionData,
  at: ReturnType<typeof createFlowStep>,
  context: BattleEngineEmissionContext,
): boolean {
  const evaluation = evaluateBattleResult(state, battleInit);
  const resultChange = createResultChange(state.result, evaluation, at);

  const previousResult = state.result;
  state.result = evaluation.result;
  if (resultChange !== null) {
    transition.resultChange = resultChange;
    transition.logEvents.push({
      event: "battle_proto_result_changed",
      fields: {
        ...createBattleResultChangedLogFields(
          state,
          previousResult,
          evaluation,
          at.phase,
          context,
        ),
        side: at.side,
      },
    });
  }

  return evaluation.result !== null;
}

function createResultChange(
  previousResult: BattleMutableState["result"],
  evaluation: BattleResultEvaluation,
  at: ReturnType<typeof createFlowStep>,
) {
  if (previousResult === evaluation.result) {
    return null;
  }

  return {
    at,
    previousResult,
    result: evaluation.result,
    reason: evaluation.reason,
  };
}
