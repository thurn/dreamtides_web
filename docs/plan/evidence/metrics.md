# Metrics

Measured baselines and monitored budgets for the run. Budgets are monitored,
never gated; a budget exceeded by more than 50% on 3 consecutive beads files an
[improvement bead](../workflow.md#triggers).

## Environment

- Host: Apple M5 Max (18 cores), macOS 26.5.2, Node v24.16.0.
- Source: `release` `c8818a221` in a fresh Tollgate worktree after `npm ci`.
- Environment for every run unless stated: `JOURNEY_TEST_WORKERS=2`,
  `DREAMTIDES_LOCAL_ASSET_HOME=.`,
  `TROX_ROOT=/Users/dthurn/.cache/quest-prototype/trox-604a79412034` (the
  values the Tollgate policy sets).
- Timing: `/usr/bin/time -p <command>` (wall `real`) unless a step prints its
  own duration. `review.mjs` prints `[review] <step> finished in Ns` for each
  step.

## Phase 1.1 baseline (2026-10-05, bead hv-b8ef.1)

### Dependencies and workspace

| Measurement | Command | Cache | Wall |
| --- | --- | --- | --- |
| Install | `npm ci --prefer-offline --no-audit --no-fund` | warm npm cache, fresh `node_modules` | 5.8 s |
| Workspace | `node scripts/prepare-workspace.mjs` | cold (no `.generated/`) | 17.1 s |
| Workspace | same | warm (run 1) | 4.1 s |
| Workspace | same | warm (run 2) | 4.0 s |

### `review:full` steps

Command: `npm run review:full` (first run in the worktree: ESLint has no
cache, the `tsc` build-info file did not exist, workspace warm). Exit 0.

| Step | Wall | Deleted in Phase 2 |
| --- | --- | --- |
| `prepare` | 4.1 s | |
| `trox-source-check` | 4.2 s | yes (2.4) |
| `ron-format-check` | 0.2 s | yes (2.3) |
| `rust-format-check` | 0.2 s | yes (2.3) |
| `rust-test` | 12.8 s | yes (2.3) |
| `clean-game-data` | 26.7 s | yes (2.3) |
| `lint` | 18.4 s | |
| `typecheck` | 10.8 s | |
| `test` | 142.2 s | |
| **Total** | **220.2 s** | 44.1 s of it is Phase 2 deletions |

Vitest's own summary for the `test` step: 518 files, 5,187 tests, duration
141.6 s (transform 14.1 s, setup 0 ms, **import 154.6 s**, tests 65.8 s,
environment 32.9 s; cumulative across 2 workers). Module import, not test
bodies, dominates the suite.

### Trox

| Command | Cache | Wall | Result |
| --- | --- | --- | --- |
| `npm run trox:gate` | Trox CLI already built in `TROX_ROOT`, workspace warm | 24.5 s | pass |

The Tollgate policy runs this as its own `trox` step (≈25 s per gate; see
[Gate total](#gate-total)). The `pre-existing-issues.txt` Trox entry is left
for Phase 2.4.

### Slowest test files

Command: `npx vitest run --reporter=json --outputFile=<tmp>/vitest.json`
(`DREAMTIDES_LOCAL_ASSET_HOME=node_modules/.cache/journey-review/local-assets`,
as `review.mjs` sets it). Wall 134.1 s; 518 files, 5,187 tests, 0 failures.

Per-file time is `endTime − startTime` from the JSON report. It covers test
execution only and excludes module import and environment setup, which the
summary above shows dominate. Sum over all files: **61.5 s**.

Extraction:
`jq -r '.testResults | map({f:.name, d:((.endTime-.startTime)/1000)}) | sort_by(-.d) | .[:40][] | "\(.d)\t\(.f)"' vitest.json`

| # | Seconds | File |
| --- | --- | --- |
| 1 | 16.64 | src/cumulus/screens/MobileBattleScreen.test.tsx |
| 2 | 5.63 | src/cumulus/screens/ExplorationSiteScreen.test.tsx |
| 3 | 4.15 | src/editor/main-editor-route.test.tsx |
| 4 | 2.59 | src/editor/CardEditorApp.test.tsx |
| 5 | 2.24 | src/root-router.test.tsx |
| 6 | 1.75 | scripts/domain-string-audit.test.mjs |
| 7 | 1.45 | src/battle/components/CumulusBattleZoneBrowser.test.tsx |
| 8 | 1.19 | scripts/cumulus-generated-docs-drift.test.mjs |
| 9 | 1.05 | src/runtime/localization/runtime.test.ts |
| 10 | 0.94 | src/cumulus/components/card/GameCardReveal.test.tsx |
| 11 | 0.90 | src/cumulus/screens/devtools/EntityRevealConformanceDemo.test.tsx |
| 12 | 0.86 | src/cumulus/screens/GambleSiteScreen.test.tsx |
| 13 | 0.78 | src/cumulus/screens/TransfigurationSiteScreen.test.tsx |
| 14 | 0.76 | scripts/dda-markdown.test.mjs |
| 15 | 0.74 | src/screens/cumulus_adapters/exploration-view-model.test.ts |
| 16 | 0.73 | src/components/ScreenRouter.test.tsx |
| 17 | 0.73 | scripts/cumulus-orphan-tokens.test.mjs |
| 18 | 0.51 | scripts/cumulus-ghost-components.test.mjs |
| 19 | 0.51 | src/cumulus/docs/CumulusApp.test.tsx |
| 20 | 0.47 | src/cumulus/screens/PurgeSiteScreen.test.tsx |
| 21 | 0.43 | src/cumulus/screens/DuplicationSiteScreen.test.tsx |
| 22 | 0.43 | src/cumulus/screens/TutorialEditorRail.test.tsx |
| 23 | 0.43 | src/cumulus/internal/reveal/context.test.tsx |
| 24 | 0.42 | src/cumulus/screens/DraftScreen.test.tsx |
| 25 | 0.34 | scripts/cumulus-duplicate-literals.test.mjs |
| 26 | 0.33 | src/cumulus/screens/CardShopSiteScreen.test.tsx |
| 27 | 0.31 | scripts/build-hash.test.mjs |
| 28 | 0.31 | src/cumulus/screens/BattleStartScreen.test.tsx |
| 29 | 0.30 | scripts/data-driven-ui-ownership.test.ts |
| 30 | 0.29 | src/atlas/atlas-generator.test.ts |
| 31 | 0.28 | src/screens/cumulus_adapters/mobile-battle-view-model.test.ts |
| 32 | 0.28 | src/cumulus/screens/AugurySiteScreen.test.tsx |
| 33 | 0.27 | src/cumulus/screens/TutorialScreen.test.tsx |
| 34 | 0.26 | src/cumulus/screens/AtlasScreen.test.tsx |
| 35 | 0.26 | src/editor/ExplorationEditorApp.test.tsx |
| 36 | 0.26 | scripts/format-ron.test.mjs |
| 37 | 0.25 | src/cumulus/internal/reveal/RevealOverlay.test.tsx |
| 38 | 0.22 | scripts/trox-csv-sync.test.mjs |
| 39 | 0.21 | src/cumulus/screens/LoadingScreen.test.tsx |
| 40 | 0.21 | src/cumulus/internal/reveal/entity-competition.test.tsx |

### Lint rules

Command: `TIMING=all CUMULUS_REPORT_BASELINES=1 npx eslint .` (single
process; ESLint disables concurrency under `TIMING`). Wall 39.2 s. It reports
247 errors, all in paths the gate does not lint (`vendor/trox-runtime` 14,
`scripts/lib` 7, `.llms/skills` 5, `tabula/` 6, root configs and other
scripts). The gate lints `src/` only:
`TIMING=20 CUMULUS_REPORT_BASELINES=1 npx eslint src/` takes 29.0 s with the
same rule ranking.

The first type-aware rule to run on a file absorbs building the TypeScript
program, so the top two `@typescript-eslint` entries mostly measure program
construction rather than rule logic.

| # | Rule | ms | Share |
| --- | --- | --- | --- |
| 1 | @typescript-eslint/no-unsafe-assignment | 8,860 | 40.5% |
| 2 | @typescript-eslint/no-misused-promises | 7,598 | 34.8% |
| 3 | @typescript-eslint/no-floating-promises | 1,465 | 6.7% |
| 4 | @typescript-eslint/no-unsafe-return | 668 | 3.1% |
| 5 | @typescript-eslint/no-unused-vars | 529 | 2.4% |
| 6 | @typescript-eslint/no-unsafe-argument | 473 | 2.2% |
| 7 | @typescript-eslint/unbound-method | 325 | 1.5% |
| 8 | @typescript-eslint/no-unsafe-member-access | 272 | 1.2% |
| 9 | cumulus/no-unlocalized-player-copy | 208 | 1.0% |
| 10 | @typescript-eslint/no-unsafe-enum-comparison | 161 | 0.7% |
| 11 | @typescript-eslint/no-base-to-string | 146 | 0.7% |
| 12 | @typescript-eslint/no-unnecessary-type-assertion | 126 | 0.6% |
| 13 | @typescript-eslint/no-unsafe-call | 103 | 0.5% |
| 14 | no-regex-spaces | 68 | 0.3% |
| 15 | no-unexpected-multiline | 66 | 0.3% |
| 16 | cumulus/no-entity-reveal-escape-hatches | 61 | 0.3% |
| 17 | @typescript-eslint/no-duplicate-type-constituents | 29 | 0.1% |
| 18 | @typescript-eslint/await-thenable | 26 | 0.1% |
| 19 | no-restricted-imports | 25 | 0.1% |
| 20 | no-fallthrough | 24 | 0.1% |

The remaining custom (`cumulus/*`) rules each cost ≤ 13 ms:
no-hardcoded-values 13.0, no-name-keyed-cards 11.7, no-adhoc-press-scale
11.2, no-untokenized-lengths 10.5, valid-token-references 9.3,
no-manual-count-copy 9.0, no-raw-icon-classes 8.6, no-inline-glass 7.8,
no-composed-type-voice 7.6, no-raw-safe-area-env 5.7,
no-raw-interactive-elements 4.3, no-external-ui-imports 4.1,
no-numeric-style-props 3.2, no-classname-in-product-ui 2.8,
no-escape-hatch-props 2.4, no-purple-text-on-glass 2.1,
screen-file-taxonomy 1.4, thin-adapters 0.7 (ms). Custom rules are not a
material lint cost.

### Typecheck

| Command | Cache | Wall |
| --- | --- | --- |
| `npx tsc --noEmit` | no build info | 10.2 s |
| `typecheck` step of `review:full` (`--incremental`, build info under `node_modules/.cache/journey-review/`) | first run, no build info | 10.8 s |
| `typecheck` step of `npm run review` | build info present (warm) | 9.6 s |

The existing `--incremental --noEmit` build info saves under 1 s.

### `npm run review` latency

Each change applied alone to the clean worktree, measured, then reverted.
Workspace warm, `tsc` build info warm, no ESLint cache.

| Change | Steps run | Wall |
| --- | --- | --- |
| One-line logic change, `src/rules/journey/shop.ts` (`Math.max(0, value)` → `Math.max(value, 0)`) | prepare 4.4, trox-source-check 4.2, lint 1.8, typecheck 9.6, test-related 45.0 (42 files, 770 tests) | **65.2 s** |
| Docs only (newline appended to `docs/journey_prototype/qa_scenes.md`) | none | **0.2 s** |
| One RON value (`data/shop_site.ron` dreamsign price 50 → 55) | prepare 5.2, ron-format-check 0.2, rust-test 2.1, test-related 2.1 | **9.9 s** |

The logic change's related-test selection pulled 42 files for a one-function
edit; Phase 1.3 checks its precision.

### Focused tests

| Command | Wall | Breakdown |
| --- | --- | --- |
| `npm test -- src/rules/journey/shop.test.ts` | 15.7 s | prepare 3.9, test 8.6, wrapper and local-asset restore ≈ 3 |
| `npm test -- src/cumulus/screens/DraftScreen.test.tsx` | 16.3 s | prepare 4.0, test 9.2 |
| `npx vitest run src/rules/journey/shop.test.ts` | 9.0 s | no prepare |

### Gate total

Per-step `elapsed_ms` from `.git/tollgate/state.sqlite3`
(`step_attempts.attempt_json`, joined to `steps` by `step_id`), summed per
buildset:

```sh
sqlite3 -separator '|' .git/tollgate/state.sqlite3 \
  "select s.buildset_id, count(*), sum(json_extract(a.attempt_json,'$.elapsed_ms'))/1000.0
   from step_attempts a join steps s on s.step_id=a.step_id
   group by s.buildset_id order by s.buildset_id"
```

The nine complete gates recorded before this bead (pre-flight and planning
commits; steps `dependencies → trox → review` at 2 test workers) took 248.7,
249.4, 251.0, 252.3, 256.2, 262.9, 274.8, 282.8 and 286.9 s: **median
256.2 s**. A typical gate splits into `dependencies` ≈ 10.6 s, `trox` ≈ 25 s
and `review` ≈ 220 s. This bead's own gate time is recorded in the next
bead's friction line (`prevBead.gateS`), because the gate runs after this
commit.

## Budgets

Monitored, never gated. "Overrun" means more than 50% over the budget.

| Budget | Value | Baseline | Measured as |
| --- | --- | --- | --- |
| `npm run review`, typical one-file logic change | ≤ 45 s | 65.2 s | wall of the bead's pre-commit `npm run review` |
| `npm run review`, docs-only change | ≤ 5 s | 0.2 s | same |
| `npm run review`, one-value data change | ≤ 20 s | 9.9 s | same |
| Focused test file, `npm test -- <file>` | ≤ 10 s | 15.7 s | wall |
| Typecheck step | ≤ 10 s | 9.6–10.8 s | `[review] typecheck finished in` |
| Lint, whole `src/` | ≤ 20 s | 18.4 s | `[review] lint finished in` (review:full) |
| Full Tollgate gate at 2 workers | ≤ 5 min | 256.2 s median | sum of step `elapsed_ms` per buildset |
| Workspace prepare, warm | ≤ 5 s | 4.0–4.1 s | `node scripts/prepare-workspace.mjs` |

The review and focused-test budgets start below the baseline on purpose:
Phase 1.3 targets them. Phase 3 adds a fuzz-smoke budget
(`npm run fuzz:engine -- --games 200`) when the command exists.

## Tollgate policy

The trusted policy is the local, untracked
`~/dreamtides_web/.tollgate/config.toml` (excluded by `.git/info/exclude`).
Every change to it is recorded here with the old and new text.

### 2026-10-05, verified unchanged (bead hv-b8ef.2)

`tg --no-launch config explain`: configuration valid, digest
`a9752faf11b7…`, steps `dependencies` (30m) → `trox` (30m) → `review`
(120m), all voting. The policy uses 2 test workers (D17) and
`sync_user_master = true`.

```toml
version = 1
sync_user_master = true

[resources]
max_buildsets = 2
repository_concurrency = 1

[remote]
enabled = true
name = "origin"
branch = "master"

[cache]
epoch = 0

[[cache.paths]]
path = "tools/game-data/target"
policy = "clone"

[[step]]
name = "dependencies"
run = "npm ci --prefer-offline --no-audit --no-fund"
timeout = "30m"

[[step]]
name = "trox"
run = "npm run trox:gate"
needs = ["dependencies"]
timeout = "30m"
environment = { DREAMTIDES_LOCAL_ASSET_HOME = ".", TROX_ROOT = "/Users/dthurn/.cache/quest-prototype/trox-604a79412034" }

[[step]]
name = "review"
run = "npm run review:full"
needs = ["trox"]
timeout = "120m"
environment = { DREAMTIDES_LOCAL_ASSET_HOME = ".", JOURNEY_TEST_WORKERS = "2", TROX_ROOT = "/Users/dthurn/.cache/quest-prototype/trox-604a79412034" }
```

## Phase 1.3 feedback-loop speedups (2026-10-05, bead hv-b8ef.3)

Each candidate was tried alone in a fresh worktree at `release` `c6972946`.
"Cold" clears the relevant cache first. The host is shared: its load average
rose from low to 25–35 (on 18 cores) during the session, so candidates that
were close were re-measured as interleaved pairs under the same load.

### Kept

| Candidate | Target metric | Before | After | Change |
| --- | --- | --- | --- | --- |
| Related tests use `JOURNEY_TEST_WORKERS` (default 2) instead of `--maxWorkers=1` in `review.mjs`'s `test-related` step | `test-related` wall for the `shop.ts` one-line change (42 files) | 71.8, 72.0, 70.6 s (mean 71.5) | 47.2, 43.3, 43.8 s (mean 44.8) | **−37%** |

The pairs above ran interleaved at load 28–36. Earlier, at low load, the same
comparison gave 45.8 / 43.9 s (1 worker, cold / warm) against 43.4 / 44.1 /
41.6 / 41.3 s (2 workers): about 5%. The second worker matters most when the
host is contended, which is its normal state. Two workers is the D17 limit;
the step still runs after lint and typecheck, never alongside them.

**Already in place (verified, unchanged):** `review.mjs` runs `tsc --noEmit
--incremental` with build info under `node_modules/.cache/journey-review/`.
`tsc --extendedDiagnostics`: cold 8.2 s wall (check 6.6 s); no-change warm
1.7 s; after a one-line body edit in `src/rules/journey/shop.ts` 1.4 s
(check 0.04 s). In the real loop (edit → `npm run review` → edit →
`npm run review`) the typecheck step took 2.1 s and 2.2 s under load. The
9.6 s "warm" figure in the 1.1 baseline followed an intervening
`trox:gate` run that rewrote typecheck inputs. `tsc -b` was not pursued.

### Rejected

| Candidate | Target metric | Before | After | Why rejected |
| --- | --- | --- | --- | --- |
| ESLint cache (`cache: true`, `cacheStrategy: "content"`, `node_modules/.cache/eslint/`) in `run-eslint.mjs` | `npm run review` lint step (changed files only) | one file 1.60 s | one file 1.62 s | No gain where it would apply. Whole-`src/` lint drops from 16.2–16.5 s to 0.77 s warm (15.9 s cold), but only `review:full` lints all of `src/`, and in Tollgate `node_modules` is fresh, so the cache is always cold. Persisting it across gates would let type-aware rules (`no-unsafe-*`, `no-misused-promises`) return stale results when a dependency's types change. |
| Vitest `pool: "forks"` (vs `"threads"`) | full suite wall, 2 workers | threads: 135.7 cold; 133.2, 133.0, 132.0 warm | forks: 151.2 cold; 159.1, 153.9, 157.5 warm | 17% slower. |
| Vitest `experimental.fsModuleCache` | full suite wall | threads as above | 142.8 cold; 138.4, 137.2, 137.8 warm | Transform drops 14 → 9.5 s, but wall rises 4%. |
| Vitest `deps.optimizer` (`client` and `ssr` enabled) | full suite wall | threads as above | 135.8 cold; 135.0 warm | No gain (+2%). |
| Vitest `isolate: false` | full suite wall | threads as above | 73.9 s, **11 files / 31 tests fail** | 45% faster but fails: jsdom component tests, `src/data/glossary-terms-symbols.test.ts` and two Firebase event-log tests depend on per-file module state. Shared module state makes results depend on file order, which the run's determinism rule forbids. |
| `lint` and `typecheck` concurrently in `review:full` | `review:full` wall | lint 18.4 s + typecheck 10.8 s sequential (1.1 baseline) | concurrent ≈ max of the two | Saves about 10 s of 220 s (4.5%), under the 10% bar. Measured directly under load: sequential 55.7 / 51.1 / 51.0 s, concurrent 35.7 / 34.1 / 35.8 s (3 cores). Worth re-measuring once Phase 2 shrinks `review:full`. |

### Findings that need no change here

- **Environment.** Vitest already defaults to `node`; 146 files opt into
  `jsdom` with `@vitest-environment jsdom` pragmas (56 more state `node`
  explicitly). There are no setup files (`setup 0ms`).
- **Import cost dominates.** Every full run reports import ≈ 150 s
  cumulative against tests ≈ 60 s. Worker count barely changes the related
  run at low load because module transform runs on the Vite server in the
  main process.
- **Selection precision.** `vitest related` follows the import graph, so
  `src/rules/journey/shop.ts` selects 42 files: the router and app tests
  that import the whole app (`src/root-router.test.tsx` 4.3 s,
  `src/editor/main-editor-route.test.tsx` 17.7 s), 15 co-op and editor
  files, and the three source-tree contract tests `review-plan.mjs` adds
  for any production source change. Nothing is selected without an import
  path, so narrowing it would trade correctness for speed. Phase 2 deletes
  the editor, co-op, the Cumulus docs drift test and the localization audit.
- **Phase 2 deletions** remove the other large per-review costs: the Trox
  Vite plugin builds Trox bundles synchronously on first import of
  `virtual:trox-bundles`, `trox-source-check` costs 4–6 s per TypeScript
  change, and `prepare` (4–7 s) materializes the RON pipeline outputs that
  D32 replaces with TypeScript modules.

## Phase 1.4 test triage (2026-10-05, beads hv-b8ef.4, .7, .8, .9)

`docs/plan/evidence/test-triage.jsonl` holds one verdict per surviving-area
test file (278 files). Final tally: 216 keep, 41 rewrite (20 product copy,
20 implementation detail, 1 statistical threshold), 21 delete. Seventeen of
the deletes cover systems Phase 2 removes (Firebase and RTDB transport,
co-op, Trox, identicons, editors, devtools, `/offers`) and execute with
those deletions; the four implementation-detail deletes and the dead
`src/draft/deck-cooccurrence` module landed in Phase 1.

Rules applied while executing:

- Asserting synthetic fixture text that a component or view model passes
  through is allowed; asserting product copy or production data (glossary
  titles, site names, screen copy) is not. Production glossary text is
  compared against its glossary entry.
- Single-line assertions that restate presentation tokens (font, color,
  background, border, shadow, spacing, filter, animation) are removed;
  geometry, transform, grid, gesture, and measured-placement assertions
  stay.

| Measurement | Before (1.1 baseline) | After | Notes |
| --- | --- | --- | --- |
| Test files | 518 | 513 | `npx vitest run`, 2 workers |
| Tests | 5,187 | 5,153 | |
| Full suite wall | 132.0–135.7 s (low host load) | 195.7 s, 198.8 s | After was measured at host load average 48–60 on 18 cores, so the walls are not comparable; the Phase 1 gate re-measures the 1.1 set. |

Most of the suite reduction comes later: the Phase 2 rows remove whole
systems' tests along with their code.
