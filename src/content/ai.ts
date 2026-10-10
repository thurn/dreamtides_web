// Automated-opponent configuration: the tutorial battle's planner and the
// engine battle's policies.

export const AI = {
  // The tutorial battle's planner (src/battle/tutorial-battle-controller.ts).
  ai: {
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
