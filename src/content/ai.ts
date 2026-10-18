// Automated-opponent policies and host budgets.

export const AI = {
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
    // answers with the main-thread Random fallback. The host sends a decision
    // only once the worker is ready, so its boot never counts against one.
    workerGraceMs: 2000,
    // How long the worker may take to boot (load its modules and build its
    // engine) before the host answers its decisions with the fallback. It
    // bounds only a worker that never starts: a development server compiles
    // the worker's modules on its first boot.
    workerBootTimeoutMs: 30000,
    // Choices answered in one run of automatic steps after which a policy
    // declines every optional prompt, so a self-retriggering "you may" ends.
    optionalChainCap: 8,
    greedy: {
      // Determinizations sampled per top-level decision.
      determinizations: 2,
      // Pass actions applied to resolve the stack after a simulated action.
      stackPassLimit: 32,
      // Repetitions of one optional loop evaluated and selected per candidate.
      loopIterationLimit: 32,
      // Candidates kept in each decision's log line.
      traceTopK: 3,
    },
  },
  // The Phase 7 position evaluation (src/engine/policy/evaluation.ts): one
  // weighted feature per entry of `weights`, each scored from the evaluating
  // side's view, positive when it favors that side.
  evaluation: {
    weights: {
      // A finished battle: the winner's value; a draw scores 0.
      victory: 1000,
      // Score difference.
      score: 10,
      // Squared progress toward scoreToWin, so points near the threshold weigh more.
      race: 40,
      // Points the current board's challenge projects for its challenging side.
      challengePoints: 6,
      // Characters the projected challenge dissolves: the opponent's minus this side's.
      challengeDissolutions: 4,
      // Spark on board by rank, effective spark (Support included), each character capped.
      frontSpark: 1.5,
      backSpark: 1,
      // Front-rank characters with at least one back-rank character supporting them.
      support: 0.5,
      // Cards in hand, capped.
      hand: 0.75,
      // Fatigue risk: cards a deck is short of `fatigueHorizon`.
      deck: 0.5,
      currentEnergy: 0.1,
      maxEnergy: 0.6,
      // Expected removal or Interrupt cards in hand, estimated from the decklist.
      threats: 1.5,
      // Characters in play.
      tempo: 0.75,
    },
    // Maximum spark credited to one character.
    sparkCap: 16,
    // Maximum cards in hand credited.
    handCap: 10,
    // Maximum energy credited, current and maximum alike.
    energyCap: 12,
    // A deck with fewer cards than this carries Fatigue risk.
    fatigueHorizon: 5,
  },
  // Frozen reference policies (D25), read only by their snapshot modules in
  // src/engine/policy/reference/. Their values never change; a new reference
  // gets a new entry.
  references: {
    // The Phase 5 Greedy, preserved as the 7.2 comparison opponent.
    // The prompt strategy both Greedy references answer with.
    "prompts@7.2": { optionalChainCap: 8 },
    "greedy@5": {
      determinizations: 2,
      stackPassLimit: 32,
      loopIterationLimit: 32,
      sparkValueCap: 32,
      energyValueCap: 32,
      traceTopK: 3,
      evaluation: { victory: 1000, scoreDifference: 10, boardSpark: 1, handCard: 0.5, energy: 0.1 },
    },
    // Greedy on the Phase 7 evaluation, frozen at 7.2.
    "greedy@7.2": {
      determinizations: 2,
      stackPassLimit: 32,
      loopIterationLimit: 32,
      traceTopK: 3,
      evaluation: {
        weights: {
          victory: 1000, score: 10, race: 40, challengePoints: 6, challengeDissolutions: 4, frontSpark: 1.5, backSpark: 1,
          support: 0.5, hand: 0.75, deck: 0.5, currentEnergy: 0.1, maxEnergy: 0.6, threats: 1.5, tempo: 0.75,
        },
        sparkCap: 16,
        handCap: 10,
        energyCap: 12,
        fatigueHorizon: 5,
      },
    },
  },
} as const;
