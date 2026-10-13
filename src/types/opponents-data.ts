import type { ContentHash, FoldHash } from "./content-hash";

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
}
