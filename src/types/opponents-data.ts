import type { CardId } from "./card-identity";
import type { AiDifficultyPresetId, IdentityRecord } from "./identifiers";

export type OpponentMode = "expectiminimax" | "worstCase";

export interface AiEvaluationWeights {
  scoreDifference: number;
  frontRankSpark: number;
  backRankSpark: number;
  handCard: number;
  valueHint: number;
  energyWaste: number;
  expectedPoints: number;
}

export interface AiOpponentModelTuning {
  removalPrior: number;
  responseArchetypePriors: {
    noBlocks: number;
    blockBiggest: number;
    tradeEvenly: number;
  };
  sampleSafetyCap: number;
}

export interface AiDifficultyPreset {
  id: AiDifficultyPresetId;
  beamWidth: number;
  opponentMode: OpponentMode;
  sampleCount: number;
  searchDepth: number;
  journeyPlanningBudgetMs: number;
  tutorialExpansionBudget: number;
}

export interface ResolvedBattleAiConfiguration extends AiDifficultyPreset {
  evaluation: AiEvaluationWeights;
  opponentModel: AiOpponentModelTuning;
}

export interface OpponentsData {
  schemaVersion: 1;
  contentHash: ContentHash;
  foldHash: FoldHash;
  opponentDeckSize: number;
  battle: {
    minimumDeckSize: number;
    playerOpeningHandSize: number;
    enemyOpeningHandSize: number;
    scoreTargets: number[];
    turnLimit: number;
    energyCap: number;
    handLimit: number;
    startingSide: "player" | "enemy";
    skipPlayerOpeningDraw: boolean;
    opponentSignatureCardCount: number;
    reward: {
      baseEssence: number;
      essencePerCompletionLevel: number;
      minimumEssence: number;
    };
  };
  dreamwell: {
    recurringOrders: number[];
    cardsPerRecurringOrder: number;
    minimumConstructedLength: number;
  };
  progression: {
    abilityActiveFromLayer: number;
    dreamsignsFromLayer: number;
    legendariesFromLayer: number;
    starterDilution: number[];
  };
  journeyAiDeck: Array<{ cardId: CardId; count: number }>;
  ai: {
    journeyDefaultPreset: AiDifficultyPresetId;
    tutorialDefaultPreset: AiDifficultyPresetId;
    evaluation: AiEvaluationWeights;
    opponentModel: AiOpponentModelTuning;
    presets: IdentityRecord<AiDifficultyPresetId, AiDifficultyPreset>;
  };
}

export function resolveBattleAiConfiguration(
  data: OpponentsData,
  use: "journey" | "tutorial",
): ResolvedBattleAiConfiguration {
  const id =
    use === "journey"
      ? data.ai.journeyDefaultPreset
      : data.ai.tutorialDefaultPreset;
  const preset = data.ai.presets[id];
  if (preset === undefined) throw new Error(`Missing compiled AI preset ${id}`);
  return {
    ...preset,
    evaluation: data.ai.evaluation,
    opponentModel: data.ai.opponentModel,
  };
}
import type { ContentHash, FoldHash } from "./content-hash";
