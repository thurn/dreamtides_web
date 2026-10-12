# Pre-existing observations for hv-umm2.496

- Vitest 4.1 switches to its agent reporter when `std-env` detects an AI agent through `AI_AGENT`, `CLAUDECODE` or `CLAUDE_CODE`. That reporter defaults to `silent: "passed-only"`. Agent sessions therefore never saw the 4.1 MB of passing-test console output that Tollgate's gate printed. Reproducing gate output locally needs `env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE`.
- About 110 `[qa]` lines (about 17 KB) reach the full-suite test output during passing tests, mostly from `scripts/qa/run-scenario-slots.test.mjs`. `say` in `scripts/qa/run-scenario.mjs` writes them with `process.stderr.write`, so Vitest's console capture and `silent` do not filter them.
