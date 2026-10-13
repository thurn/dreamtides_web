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
      // Repetitions of one optional loop simulated per candidate; the live action keeps its requested count.
      loopIterationLimit: 32,
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
