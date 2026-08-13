import type { OpponentsData } from "../types/opponents-data";

const STARTER_IDS = [
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
  "647f5150-b2e0-424b-9480-27557642524e",
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
  "a28ad36d-fa74-4190-a463-7efd3a6233d0",
  "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
  "5ab11bef-5dcd-49f5-be49-ae2ccde76e70",
  "4408b942-09a0-4f4e-a403-10c708c6e3c5",
  "2162742c-09d0-4e62-ae49-0f8f79b45adc",
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
  "944e15d2-d680-4ebe-8d18-36826f4b1535",
] as const;

/** Stable synthetic opponent input for tests which are not testing compilation. */
export function opponentsFixture(): OpponentsData {
  const standard = {
    id: "standard",
    beamWidth: 12,
    opponentMode: "expectiminimax" as const,
    sampleCount: 8,
    searchDepth: 16,
    journeyPlanningBudgetMs: 100,
    tutorialExpansionBudget: 256,
  };
  return {
    schemaVersion: 1,
    contentHash: "b".repeat(64),
    foldHash: "b".repeat(64),
    opponentDeckSize: 30,
    battle: {
      minimumDeckSize: 25,
      playerOpeningHandSize: 5,
      enemyOpeningHandSize: 5,
      scoreTargets: [10, 25],
      turnLimit: 50,
      energyCap: 10,
      handLimit: 10,
      startingSide: "player",
      skipPlayerOpeningDraw: true,
      opponentSignatureCardCount: 3,
    },
    dreamwell: {
      openingOrders: [0],
      recurringOrders: [1, 2, 3, 4],
      cardsPerRecurringOrder: 5,
      minimumConstructedLength: 62,
    },
    progression: {
      abilityActiveFromLayer: 1,
      dreamsignsFromLayer: 3,
      legendariesFromLayer: 5,
      starterDilution: [10, 5],
    },
    journeyAiDeck: STARTER_IDS.map((cardId) => ({ cardId, count: 3 })),
    ai: {
      journeyDefaultPreset: "standard",
      tutorialDefaultPreset: "standard",
      evaluation: {
        scoreDifference: 10,
        frontRankSpark: 1,
        backRankSpark: 0.5,
        handCard: 1.5,
        valueHint: 1,
        energyWaste: 0.25,
        expectedPoints: 1,
      },
      opponentModel: {
        removalPrior: 0.1,
        responseArchetypePriors: {
          noBlocks: 1,
          blockBiggest: 2,
          tradeEvenly: 3,
        },
        sampleSafetyCap: 16,
      },
      presets: { standard },
    },
  };
}
