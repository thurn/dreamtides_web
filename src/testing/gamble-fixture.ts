import type { GambleData, GamblePresentation } from "../types/gamble-data";

function presentation(
  actionKeys: readonly string[],
  outcomeKeys: readonly string[],
): GamblePresentation {
  return {
    title: "Fixture game",
    rulesDisclosure: "Fixture rules",
    accessibilityDescription: "Fixture accessible description",
    actionLabels: actionKeys.map((key) => ({ key, text: `Action ${key}` })),
    outcomeLabels: outcomeKeys.map((key) => ({ key, text: `Outcome ${key}` })),
  };
}

const FIXTURE: GambleData = {
  schemaVersion: 1,
  contentHash: "fixture-gamble-content-hash",
  foldHash: "fixture-gamble-fold-hash",
  games: [
    {
      id: "gravok-three-gate-wager",
      rulesVersion: "fixture-three-gate-rules",
      selection: { weight: 1, fallback: true },
      presentation: presentation(["bet", "leave"], ["won", "bust"]),
      economy: {
        kind: "threeGate",
        standardWager: 50,
        enhancedWager: 45,
        rewards: [
          { gate: "six", essence: 100 },
          { gate: "nine", essence: 150 },
          { gate: "jack", essence: 200 },
        ],
      },
      rules: {
        kind: "threeGate",
        standardDeckSize: 52,
        maxRetries: 2,
        gates: [
          {
            gate: "six",
            label: "Fixture Six",
            threshold: "6",
            winningCardCount: 36,
            awardsDreamsign: false,
          },
          {
            gate: "nine",
            label: "Fixture Nine",
            threshold: "9",
            winningCardCount: 24,
            awardsDreamsign: false,
          },
          {
            gate: "jack",
            label: "Fixture Jack",
            threshold: "J",
            winningCardCount: 16,
            awardsDreamsign: true,
          },
        ],
      },
    },
    {
      id: "tidemark-ladder-climb",
      rulesVersion: "fixture-ladder-rules",
      selection: { weight: 1, fallback: false },
      presentation: presentation(["draw", "leave"], ["won", "miss"]),
      economy: {
        kind: "ladderClimb",
        winEssence: 25,
        attempts: [
          { attempt: 1, standardCost: 0, enhancedCost: 0 },
          { attempt: 2, standardCost: 5, enhancedCost: 0 },
          { attempt: 3, standardCost: 10, enhancedCost: 0 },
          { attempt: 4, standardCost: 15, enhancedCost: 0 },
        ],
      },
      rules: {
        kind: "ladderClimb",
        standardDeckSize: 52,
        strongPoolLimit: 50,
        attempts: [
          { attempt: 1, threshold: "Q", winningCardCount: 12 },
          { attempt: 2, threshold: "10", winningCardCount: 20 },
          { attempt: 3, threshold: "8", winningCardCount: 28 },
          { attempt: 4, threshold: "6", winningCardCount: 36 },
        ],
      },
    },
    {
      id: "starway-stairs",
      rulesVersion: "fixture-starway-rules",
      selection: { weight: 1, fallback: false },
      presentation: presentation(
        ["bet", "climb", "take"],
        ["safe", "bust", "prize-at-stake"],
      ),
      economy: {
        kind: "starwayStairs",
        standardWager: 30,
        enhancedWager: 20,
        rewards: [
          { tier: 1, essence: 60 },
          { tier: 2, essence: 140 },
          { tier: 3, essence: 300 },
        ],
      },
      rules: {
        kind: "starwayStairs",
        standardDeckSize: 52,
        maxRetries: 2,
        tiers: [
          { tier: 1, highestBustRank: "2", bustCardCount: 4 },
          { tier: 2, highestBustRank: "4", bustCardCount: 12 },
          { tier: 3, highestBustRank: "7", bustCardCount: 24 },
        ],
      },
    },
    {
      id: "four-suit-reprise",
      rulesVersion: "fixture-four-suit-rules",
      selection: { weight: 1, fallback: false },
      presentation: presentation(
        ["draw", "choose-another"],
        ["transfiguration", "essence", "duplication", "purge"],
      ),
      economy: {
        kind: "fourSuitReprise",
        standardDrawPrice: 25,
        enhancedDrawPrice: 15,
        essenceReward: 100,
      },
      rules: {
        kind: "fourSuitReprise",
        standardDeckSize: 52,
        maxRounds: 3,
        matchingSuitCardCount: 13,
        outcomes: [
          { suit: "spades", outcome: "transfiguration" },
          { suit: "diamonds", outcome: "essence" },
          { suit: "hearts", outcome: "duplication" },
          { suit: "clubs", outcome: "purge" },
        ],
      },
    },
    {
      id: "blackjack",
      rulesVersion: "fixture-blackjack-rules",
      selection: { weight: 1, fallback: false },
      presentation: presentation(
        ["deal", "hit", "stand"],
        ["player-win", "dealer-win", "push", "bust", "wager-returned", "wins"],
      ),
      economy: {
        kind: "blackjack",
        standardWager: 90,
        enhancedWager: 40,
        prizeEssence: 300,
      },
      rules: {
        kind: "blackjack",
        standardDeckSize: 52,
        maxAttempts: 3,
        target: 21,
        dealerStandThreshold: 17,
      },
    },
  ],
};

export function gambleFixture(): GambleData {
  return FIXTURE;
}
