// Internal automated-opponent deck and planning configuration.

export const AI = {
  journeyAiDeck: [
    {
      cardId: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
      count: 3,
    },
    {
      cardId: "647f5150-b2e0-424b-9480-27557642524e",
      count: 3,
    },
    {
      cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
      count: 3,
    },
    {
      cardId: "a28ad36d-fa74-4190-a463-7efd3a6233d0",
      count: 3,
    },
    {
      cardId: "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
      count: 3,
    },
    {
      cardId: "5ab11bef-5dcd-49f5-be49-ae2ccde76e70",
      count: 3,
    },
    {
      cardId: "4408b942-09a0-4f4e-a403-10c708c6e3c5",
      count: 3,
    },
    {
      cardId: "2162742c-09d0-4e62-ae49-0f8f79b45adc",
      count: 3,
    },
    {
      cardId: "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
      count: 3,
    },
    {
      cardId: "944e15d2-d680-4ebe-8d18-36826f4b1535",
      count: 3,
    },
  ],
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
    presets: {
      standard: {
        id: "standard",
        beamWidth: 12,
        opponentMode: "expectiminimax",
        sampleCount: 8,
        searchDepth: 16,
        // Journey planning stops when this wall-clock budget is exhausted.
        journeyPlanningBudgetMs: 100,
        // Tutorial planning uses a fixed expansion count so replays agree.
        tutorialExpansionBudget: 256,
      },
    },
  },
  // The engine battle's policies (src/engine/policy/): the AI host runs one
  // for the enemy of every journey battle.
  enginePolicy: {
    // `?ai=random|greedy` overrides it for QA.
    journeyDefault: "greedy",
    // D23 thinking budgets. Live play stops at the wall-clock cap; tests and
    // tournaments count iterations (Greedy: one simulated action each).
    budgets: {
      // A main decision in the AI's own Day.
      turnPlanning: { wallClockMs: 1500, iterations: 256 },
      // Responses, Dusk, Night, and prompt answers.
      response: { wallClockMs: 500, iterations: 64 },
    },
    // How long past its budget the host waits for the worker before it
    // answers with the main-thread Random fallback.
    workerGraceMs: 2000,
    // Choices answered in one run of automatic steps after which a policy
    // declines every optional prompt, so a self-retriggering "you may" ends.
    optionalChainCap: 8,
    greedy: {
      // Determinizations sampled per top-level decision.
      determinizations: 2,
      // Pass actions applied to resolve the stack after a simulated action.
      stackPassLimit: 32,
      // Candidates kept in each decision's log line.
      traceTopK: 3,
      evaluation: {
        victory: 1000,
        scoreDifference: 10,
        boardSpark: 1,
        handCard: 0.5,
        energy: 0.1,
      },
    },
  },
} as const;
