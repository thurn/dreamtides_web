import type { OpponentsData } from "../types/opponents-data";
import { testContentHash, testFoldHash } from "../types/test-identities";

/** Stable synthetic opponent input for tests which are not testing compilation. */
export function opponentsFixture(): OpponentsData {
  return {
    schemaVersion: 1,
    contentHash: testContentHash("b"),
    foldHash: testFoldHash("b"),
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
      reward: {
        baseEssence: 100,
        essencePerCompletionLevel: 50,
        minimumEssence: 0,
      },
    },
    dreamwell: {
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
  };
}
