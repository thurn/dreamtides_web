import { resolvePlayCard, resolveMoveCard } from "../engine/play-card";
import { resolveJudgment } from "../engine/judgment";
import { selectEffectiveSparkOrZero } from "../state/selectors";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";
import type {
  BattleAiChoiceTrace,
  BattleFieldSlotAddress,
  BattleMutableState,
  DeploySlotId,
  ReserveSlotId,
} from "../types";

export interface BattleAiProgress {
  hasPlayedCharacter: boolean;
  hasPlayedNonCharacter: boolean;
  hasRepositioned: boolean;
}

export type BattleAiDecision =
  | {
    type: "PLAY_CARD";
    trace: BattleAiChoiceTrace;
    battleCardId: string;
    target?: BattleFieldSlotAddress;
  }
  | {
    type: "MOVE_CARD";
    trace: BattleAiChoiceTrace;
    battleCardId: string;
    target: BattleFieldSlotAddress;
  }
  | {
    type: "END_TURN";
    trace: BattleAiChoiceTrace;
  };

export function chooseAiAction(
  state: BattleMutableState,
  progress: BattleAiProgress,
): BattleAiDecision {
  return (progress.hasPlayedCharacter ? null : chooseBestAffordableCharacterPlay(state))
    ?? chooseImprovingReposition(state, progress)
    ?? chooseAffordableNonCharacterPlay(state, progress)
    ?? {
      type: "END_TURN",
      trace: {
        stage: "endTurn",
        choice: "END_TURN",
        battleCardId: null,
        cardName: null,
        sourceHandIndex: null,
        sourceSlotId: null,
        targetSlotId: null,
        heuristicScoreBefore: null,
        heuristicScoreAfter: null,
      },
    };
}

export function evaluatePredictedJudgmentDifferential(
  state: BattleMutableState,
): number {
  const judgment = resolveJudgment(state);
  return judgment.enemyScoreDelta - judgment.playerScoreDelta;
}

function chooseBestAffordableCharacterPlay(
  state: BattleMutableState,
): BattleAiDecision | null {
  const currentHeuristic = evaluatePredictedJudgmentDifferential(state);
  const sideState = state.sides.enemy;
  let bestChoice: BattleAiDecision | null = null;
  let bestHeuristic = Number.NEGATIVE_INFINITY;

  for (const [sourceHandIndex, battleCardId] of sideState.hand.entries()) {
    const card = state.cardInstances[battleCardId];
    if (
      card === undefined ||
      card.definition.battleCardKind !== "character" ||
      card.definition.energyCost > sideState.currentEnergy
    ) {
      continue;
    }

    for (const target of listCharacterPlayTargets(state)) {
      const resolved = resolvePlayCard(state, battleCardId, target);
      if (resolved.state === state) {
        continue;
      }

      // Spec "AI Detail" recommended loop guard: "if no board-improving action
      // exists, end turn". Skip character plays whose predicted judgment
      // differential after play is weakly worse than the current board — this
      // makes the gate symmetric with `chooseImprovingReposition`.
      const heuristicAfter = evaluatePredictedJudgmentDifferential(resolved.state);
      if (target.zone === "deployed" && heuristicAfter <= currentHeuristic) {
        continue;
      }
      const candidate: BattleAiDecision = {
        type: "PLAY_CARD",
        battleCardId,
        target,
        trace: {
          stage: "character",
          choice: "PLAY_CARD",
          battleCardId,
          cardName: card.definition.name,
          sourceHandIndex,
          sourceSlotId: null,
          targetSlotId: target.slotId,
          heuristicScoreBefore: currentHeuristic,
          heuristicScoreAfter: heuristicAfter,
        },
      };

      if (
        heuristicAfter > bestHeuristic ||
        (heuristicAfter === bestHeuristic && shouldPreferPlayChoice(candidate, bestChoice, state))
      ) {
        bestChoice = candidate;
        bestHeuristic = heuristicAfter;
      }
    }
  }

  return bestChoice;
}

function chooseImprovingReposition(
  state: BattleMutableState,
  progress: BattleAiProgress,
): BattleAiDecision | null {
  if (progress.hasRepositioned) {
    return null;
  }

  const currentHeuristic = evaluatePredictedJudgmentDifferential(state);
  let bestChoice: BattleAiDecision | null = null;
  let bestHeuristic = currentHeuristic;

  for (const source of listEnemySourceSlots(state)) {
    const battleCardId = getOccupant(state, source);
    if (battleCardId === null) {
      continue;
    }

    for (const target of listEnemyRepositionTargets(source)) {
      const resolved = resolveMoveCard(state, battleCardId, target);
      if (resolved.state === state) {
        continue;
      }

      const heuristicAfter = evaluatePredictedJudgmentDifferential(resolved.state);
      if (heuristicAfter <= currentHeuristic) {
        continue;
      }

      const candidate: BattleAiDecision = {
        type: "MOVE_CARD",
        battleCardId,
        target,
        trace: {
          stage: "reposition",
          choice: "MOVE_CARD",
          battleCardId,
          cardName: state.cardInstances[battleCardId]?.definition.name ?? "Card",
          sourceHandIndex: null,
          sourceSlotId: source.slotId,
          targetSlotId: target.slotId,
          heuristicScoreBefore: currentHeuristic,
          heuristicScoreAfter: heuristicAfter,
        },
      };

      if (
        heuristicAfter > bestHeuristic ||
        (heuristicAfter === bestHeuristic && shouldPreferMoveChoice(candidate, bestChoice))
      ) {
        bestChoice = candidate;
        bestHeuristic = heuristicAfter;
      }
    }
  }

  return bestChoice;
}

function chooseAffordableNonCharacterPlay(
  state: BattleMutableState,
  progress: BattleAiProgress,
): BattleAiDecision | null {
  if (progress.hasPlayedNonCharacter) {
    return null;
  }

  const sideState = state.sides.enemy;

  for (const [sourceHandIndex, battleCardId] of sideState.hand.entries()) {
    const card = state.cardInstances[battleCardId];
    if (
      card === undefined ||
      card.definition.battleCardKind === "character" ||
      card.definition.energyCost > sideState.currentEnergy
    ) {
      continue;
    }

    return {
      type: "PLAY_CARD",
      battleCardId,
      trace: {
        stage: "nonCharacter",
        choice: "PLAY_CARD",
        battleCardId,
        cardName: card.definition.name,
        sourceHandIndex,
        sourceSlotId: null,
        targetSlotId: null,
        heuristicScoreBefore: null,
        heuristicScoreAfter: null,
      },
    };
  }

  return null;
}

function listCharacterPlayTargets(state: BattleMutableState): BattleFieldSlotAddress[] {
  const targets: BattleFieldSlotAddress[] = [];

  for (const target of [
    ...RESERVE_SLOT_IDS.map((slotId) => ({
      side: "enemy" as const,
      zone: "reserve" as const,
      slotId,
    })),
    ...DEPLOY_SLOT_IDS.map((slotId) => ({
      side: "enemy" as const,
      zone: "deployed" as const,
      slotId,
    })),
  ]) {
    if (getOccupant(state, target) === null) {
      targets.push(target);
    }
  }

  return targets;
}

function listEnemySourceSlots(state: BattleMutableState): BattleFieldSlotAddress[] {
  return [
    ...DEPLOY_SLOT_IDS.map((slotId) => ({
      side: "enemy" as const,
      zone: "deployed" as const,
      slotId,
    })),
    ...RESERVE_SLOT_IDS.map((slotId) => ({
      side: "enemy" as const,
      zone: "reserve" as const,
      slotId,
    })),
  ].filter((source) => getOccupant(state, source) !== null);
}

function listEnemyRepositionTargets(
  source: BattleFieldSlotAddress,
): BattleFieldSlotAddress[] {
  const targetSlotIds = source.zone === "reserve" ? DEPLOY_SLOT_IDS : RESERVE_SLOT_IDS;
  const targetZone = source.zone === "reserve" ? "deployed" as const : "reserve" as const;

  return targetSlotIds
    .filter((slotId) => slotId !== source.slotId)
    .map((slotId) => ({
      side: "enemy" as const,
      zone: targetZone,
      slotId,
    }));
}

function getOccupant(
  state: BattleMutableState,
  slot: BattleFieldSlotAddress,
): string | null {
  return slot.zone === "reserve"
    ? state.sides.enemy.reserve[slot.slotId as ReserveSlotId]
    : state.sides.enemy.deployed[slot.slotId as DeploySlotId];
}

export function shouldPreferPlayChoice(
  candidate: Extract<BattleAiDecision, { type: "PLAY_CARD" }>,
  currentBest: BattleAiDecision | null,
  state: BattleMutableState,
): boolean {
  if (currentBest === null || currentBest.type !== "PLAY_CARD") {
    return true;
  }

  // J-5 tiebreakers: highest energy cost → character before event → higher
  // printed spark → stable hand order.
  const candidateDef = state.cardInstances[candidate.battleCardId]?.definition;
  const currentDef = state.cardInstances[currentBest.battleCardId]?.definition;
  const candidateCost = candidateDef?.energyCost ?? 0;
  const currentCost = currentDef?.energyCost ?? 0;
  if (candidateCost !== currentCost) {
    return candidateCost > currentCost;
  }

  const candidateIsCharacter = candidateDef?.battleCardKind === "character";
  const currentIsCharacter = currentDef?.battleCardKind === "character";
  if (candidateIsCharacter !== currentIsCharacter) {
    return candidateIsCharacter;
  }

  const candidateSpark = candidateDef?.printedSpark ?? 0;
  const currentSpark = currentDef?.printedSpark ?? 0;
  if (candidateSpark !== currentSpark) {
    return candidateSpark > currentSpark;
  }

  const candidateHandIndex = candidate.trace.sourceHandIndex ?? Number.MAX_SAFE_INTEGER;
  const currentHandIndex = currentBest.trace.sourceHandIndex ?? Number.MAX_SAFE_INTEGER;
  if (candidateHandIndex !== currentHandIndex) {
    return candidateHandIndex < currentHandIndex;
  }

  // J-6 lane-choice tiebreakers: open lane creating immediate scoring
  // pressure → favorable trade → equal trade → leftmost. Spec E-8: AI combat
  // evaluation uses `effectiveSpark`, not printed spark, so `sparkDelta`
  // from KINDLE / SET_CARD_SPARK / SET_CARD_SPARK_DELTA feeds the decision
  // (bug-005). Printed spark remains the J-5 tiebreaker (see above).
  const candidateAttackerSpark = selectEffectiveSparkOrZero(state, candidate.battleCardId);
  const currentAttackerSpark = selectEffectiveSparkOrZero(state, currentBest.battleCardId);
  const candidateBucket = computeLaneChoiceBucket(state, candidate, candidateAttackerSpark);
  const currentBucket = computeLaneChoiceBucket(state, currentBest, currentAttackerSpark);
  if (candidateBucket !== currentBucket) {
    return candidateBucket < currentBucket;
  }

  const candidateTarget = candidate.target?.slotId ?? "";
  const currentTarget = currentBest.target?.slotId ?? "";
  if (candidateTarget !== currentTarget) {
    return candidateTarget.localeCompare(currentTarget) < 0;
  }

  return candidate.battleCardId.localeCompare(currentBest.battleCardId) < 0;
}

/**
 * Returns the J-6 lane-choice bucket for a play candidate. Lower buckets are
 * preferred.
 * - 0: open deployed lane with no enemy blocker and positive-spark attacker
 *   (immediate scoring pressure).
 * - 1: favorable trade — attacker printed spark strictly exceeds the enemy
 *   blocker in the same deployed lane.
 * - 2: equal trade — attacker printed spark equals the enemy blocker.
 * - 3: any other placement (including reserve plays and unfavorable trades);
 *   leftmost is resolved by the target-slot tiebreaker in the caller.
 */
export function computeLaneChoiceBucket(
  state: BattleMutableState,
  candidate: Extract<BattleAiDecision, { type: "PLAY_CARD" }>,
  attackerSpark: number,
): number {
  const target = candidate.target;
  if (target === undefined || target.zone !== "deployed") {
    return 3;
  }

  const enemyBlocker = state.sides.player.deployed[target.slotId as DeploySlotId];
  if (enemyBlocker === null) {
    return attackerSpark > 0 ? 0 : 3;
  }

  // Spec E-8: lane trade evaluation uses effective spark (bug-005).
  const blockerSpark = selectEffectiveSparkOrZero(state, enemyBlocker);
  if (attackerSpark > blockerSpark) {
    return 1;
  }
  if (attackerSpark === blockerSpark) {
    return 2;
  }
  return 3;
}

export function shouldPreferMoveChoice(
  candidate: Extract<BattleAiDecision, { type: "MOVE_CARD" }>,
  currentBest: BattleAiDecision | null,
): boolean {
  if (currentBest === null || currentBest.type !== "MOVE_CARD") {
    return true;
  }

  const candidateSource = candidate.trace.sourceSlotId ?? "";
  const currentSource = currentBest.trace.sourceSlotId ?? "";
  if (candidateSource !== currentSource) {
    return candidateSource.localeCompare(currentSource) < 0;
  }

  const candidateTarget = candidate.target.slotId;
  const currentTarget = currentBest.target.slotId;
  if (candidateTarget !== currentTarget) {
    return candidateTarget.localeCompare(currentTarget) < 0;
  }

  return candidate.battleCardId.localeCompare(currentBest.battleCardId) < 0;
}
