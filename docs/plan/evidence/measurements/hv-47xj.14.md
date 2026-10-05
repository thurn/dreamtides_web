# hv-47xj.14 measurements (2.7a Cull scripts, npm scripts, and dependencies)

## Counts

| | Before | After |
| --- | --- | --- |
| Files under `scripts/` | 66 | 32 |
| npm scripts in `package.json` | 28 | 15 |
| `dependencies` | 5 | 5 |
| `devDependencies` | 23 | 17 |
| Packages in `package-lock.json` | — | 88 fewer, no version changes |

Kept under `scripts/`, by the npm script or module that reaches them:

- `review`, `review:full`, `lint`, `lint:full`, `test`, `test:full`,
  `typecheck`: `review.mjs`, `review-plan.mjs`, `review-lock.mjs`,
  `typecheck-cache.mjs`, `run-eslint.mjs`, with the tests of the first four.
- `dev`, `build`, `prepare-workspace`, `setup-assets`: `dev.mjs`,
  `prepare-workspace.mjs`, `setup-assets.ts`, `generate-cumulus-tokens.mjs`,
  `lib/cumulus-css-tokens.mjs`, and their tests.
- `fuzz:engine`: `fuzz-engine.ts`.
- `regenerate-replay-fixtures`: `regenerate-replay-fixtures.mjs`. The replay
  test's fixtures are re-stamped with it after an intentional reducer change.
- QA: `screenshot-runtime.mjs`, the MCP client that the Phase 4 card sweep
  builds on (`docs/plan/workflow.md` § Card QA).
- Imported by `src/` or `vite.config.ts`: `saved-journeys-api.mjs` (+ test),
  `exploration-effect-kinds.mjs`, `glossary-source.mjs`,
  `tutorial-battle-contracts.mjs`, `reward-selection-contracts.mjs` (+ test),
  and the four `.d.mts` declarations. These 11 files are application modules
  that live under `scripts/`. Moving them into `src/` (an area outside this
  bead) brings the count to 21.

Deleted: the desktop and device screenshot tools and their configuration,
report, and device tables; `playwright-mcp-capture.mjs`; `list-qa-scenes.mjs`;
`dev-processes.mjs` and `kill-dev-servers.sh`; `load-saved-journey.mjs`;
`send-screenshots-to-discord.mjs`; the Iosevka RON font builder; the `?raw`
import loader (the replay regenerator runs under plain `tsx` and writes
byte-identical fixtures); the journey presentation oracle; the source-scanning
Cumulus token and boundary tests (D19: presentation tokens); the data-driven UI
ownership inventory and test; and the lint-baseline machinery
(`lint-baselines.mjs`, `eslint-rules/ui-boundary-baselines.js`, and the
reconciliation in `run-eslint.mjs`). `no-tracked-generated-artifacts.test.mjs`
merged into `prepare-workspace.test.mjs`.

npm scripts deleted: `launch`, `qai`, `load-journey`, `start`, `dev:vite`,
`validate`, `cumulus-tokens`, `send-screenshots`, `device-screenshots`,
`screenshots:desktop`, `dev:status`, `dev:stop`, `kill-dev-servers`. Kept:
`dev`, `build`, `build:prepared`, `preview`, `lint`, `lint:full`, `test`,
`test:full`, `typecheck`, `review`, `review:full`, `setup-assets`,
`prepare-workspace`, `fuzz:engine`, `regenerate-replay-fixtures`.

Dependencies (`knip --dependencies`, knip 6.39.0) removed: `@noble/hashes`
(duplicate of `js-sha256`, which `src/` uses; no import migration needed),
`@playwright/test`, `@typescript-eslint/eslint-plugin` (provided through
`typescript-eslint`), `fast-check`, `markdownlint-cli2`, `prettier`.
`smol-toml` was already gone. Kept despite knip: `@modelcontextprotocol/sdk`
(`scripts/screenshot-runtime.mjs`, which nothing imports yet) and
`brace-expansion` (the `overrides` entry pins it to `vendor/brace-expansion`).

## Lint time

ESLint covers `src/` only, so deleting scripts does not change its input. The
baseline reconciliation that `run-eslint.mjs` drops matched an empty list.

| Command | Before | After |
| --- | --- | --- |
| `npm run lint:full` wall | 13.4 s (lint step 12.5 s), load 7.74 | 13.8 s (lint step 12.9 s), load 4.17 |
| `npm run lint` wall (diff-aware) | 0.2 s, no changed files, load 7.42 | 0.9 s, 5 changed files and none lintable, load 4.43 |
| Lint step inside `review:full` | — | 13.5 s, load 4.19 |

The lint wall time is unchanged within host-load noise.

## Validation

- `JOURNEY_TEST_WORKERS=2 npm run review:full`: passed, 56 s wall, host load
  4.19 at start (20.6 at end); 192 test files and 2,089 tests.
- `npm run build`: passed, 10.5 s, load 4.39.
- `npm run fuzz:engine -- --games 5`: 5 games, 0 failures, 1.7 s.
- `npm run regenerate-replay-fixtures`: fixtures unchanged.

## Tests

17 test files deleted (one `jsdom`), 1,881 lines deleted and 18 added
(net −1,863).
