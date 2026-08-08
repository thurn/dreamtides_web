import type {
  GambleGameId,
  GravokGateId,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
  StarwayStairsTierNumber,
  TidemarkLadderClimbAttemptNumber,
} from "./gamble";

export type FourSuitRepriseOutcome =
  "transfiguration" | "essence" | "duplication" | "purge";

export interface GamblePresentation {
  title: string;
  rulesDisclosure: string;
  accessibilityDescription: string;
  actionLabels: readonly { key: string; text: string }[];
  outcomeLabels: readonly { key: string; text: string }[];
}

interface GambleGameBase {
  id: GambleGameId;
  rulesVersion: string;
  selection: { weight: number; fallback: boolean };
  presentation: GamblePresentation;
}

export interface ThreeGateGame extends GambleGameBase {
  economy: {
    kind: "threeGate";
    standardWager: number;
    enhancedWager: number;
    rewards: readonly { gate: GravokGateId; essence: number }[];
  };
  rules: {
    kind: "threeGate";
    standardDeckSize: number;
    maxRetries: number;
    gates: readonly {
      gate: GravokGateId;
      label: string;
      threshold: StandardPlayingCardRank;
      winningCardCount: number;
      awardsDreamsign: boolean;
    }[];
  };
}

export interface LadderClimbGame extends GambleGameBase {
  economy: {
    kind: "ladderClimb";
    winEssence: number;
    attempts: readonly {
      attempt: TidemarkLadderClimbAttemptNumber;
      standardCost: number;
      enhancedCost: number;
    }[];
  };
  rules: {
    kind: "ladderClimb";
    standardDeckSize: number;
    strongPoolLimit: number;
    attempts: readonly {
      attempt: TidemarkLadderClimbAttemptNumber;
      threshold: StandardPlayingCardRank;
      winningCardCount: number;
    }[];
  };
}

export interface StarwayStairsGame extends GambleGameBase {
  economy: {
    kind: "starwayStairs";
    standardWager: number;
    enhancedWager: number;
    rewards: readonly { tier: StarwayStairsTierNumber; essence: number }[];
  };
  rules: {
    kind: "starwayStairs";
    standardDeckSize: number;
    maxRetries: number;
    tiers: readonly {
      tier: StarwayStairsTierNumber;
      highestBustRank: StandardPlayingCardRank;
      bustCardCount: number;
    }[];
  };
}

export interface FourSuitRepriseGame extends GambleGameBase {
  economy: {
    kind: "fourSuitReprise";
    standardDrawPrice: number;
    enhancedDrawPrice: number;
    essenceReward: number;
  };
  rules: {
    kind: "fourSuitReprise";
    standardDeckSize: number;
    maxRounds: number;
    matchingSuitCardCount: number;
    outcomes: readonly {
      suit: StandardPlayingCardSuit;
      outcome: FourSuitRepriseOutcome;
    }[];
  };
}

export interface BlackjackGame extends GambleGameBase {
  economy: {
    kind: "blackjack";
    standardWager: number;
    enhancedWager: number;
    prizeEssence: number;
  };
  rules: {
    kind: "blackjack";
    standardDeckSize: number;
    maxAttempts: number;
    target: number;
    dealerStandThreshold: number;
  };
}

export type GambleGameDefinition =
  | ThreeGateGame
  | LadderClimbGame
  | StarwayStairsGame
  | FourSuitRepriseGame
  | BlackjackGame;

export type GambleRulesKind = GambleGameDefinition["rules"]["kind"];

export interface GambleData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  games: readonly GambleGameDefinition[];
}
