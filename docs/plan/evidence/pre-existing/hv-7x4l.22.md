# hv-7x4l.22 pre-existing issues

- **An engine test branches on a production tunable.**
  `src/engine/prompts/answers.test.ts` imports `BATTLE` from
  `src/content/battle.ts` and asserts one of two outcomes of `forcedAnswer`
  depending on `BATTLE.autoAnswerForcedPrompts`. It is the one engine test
  besides `src/engine/content-gates.test.ts` that reads `src/content`. The
  test would read no tunable if `forcedAnswer` took the setting as a
  parameter (as `battleConfig` reads the other battle tunables into
  the battle config), so each branch could be asserted with a synthetic value.
  It needs its own bead, since it changes `src/engine/prompts/answers.ts`.
