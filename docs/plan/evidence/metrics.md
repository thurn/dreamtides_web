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
Phase 1.3 targets them. The fuzz-smoke budget is in the
[Phase 2 gate budget revision](#budget-revision-phase-2-retrospective).

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

### Staged validation policy (T9)

Bead hv-ki3p.10 drafts the staged-mode policy of
[D44](../decisions.md#d44-staged-validation); the orchestrator applies
exactly the text of [`t9-policy.toml`](t9-policy.toml) with
`tg config validate` then `apply`. Tollgate step names allow only
`[A-Za-z0-9._-]`, so the steps are `review-gate`, `review-full`, and
`fuzz`.

Old text (active digest `68c1e461196b…`, steps `dependencies` → `review`,
no release stage):

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

[[step]]
name = "dependencies"
run = "npm ci --prefer-offline --no-audit --no-fund"
timeout = "30m"

[[step]]
name = "review"
run = "npm run review:full"
needs = ["dependencies"]
timeout = "120m"
environment = { DREAMTIDES_LOCAL_ASSET_HOME = ".", JOURNEY_TEST_WORKERS = "2" }
```

New text: gate stage `dependencies` → `review-gate`; release stage
`review-full` and `fuzz`, each needing only `dependencies`. `tg config
validate` takes no path, so the draft was parsed with Tollgate's own
`tollgate_config::EffectiveConfig::parse` (crate at `~/tollgate`
`c3303ef`, which reproduces the active digest above for the old text):
valid, digest `407f184944ea…`, gate run `dependencies, review-gate`,
release run `dependencies, review-full, fuzz`.

```toml
version = 1
sync_user_master = "staging"

[resources]
max_buildsets = 2
repository_concurrency = 1
release_concurrency = 1
max_release_lag = 5

[remote]
enabled = true
name = "origin"
branch = "master"

[cache]
epoch = 0

[[step]]
name = "dependencies"
run = "npm ci --prefer-offline --no-audit --no-fund"
timeout = "30m"

[[step]]
name = "review-gate"
run = "npm run review:gate"
needs = ["dependencies"]
timeout = "15m"
environment = { DREAMTIDES_LOCAL_ASSET_HOME = ".", JOURNEY_TEST_WORKERS = "2" }

[[step]]
name = "review-full"
run = "npm run review:full"
stage = "release"
needs = ["dependencies"]
timeout = "120m"
environment = { DREAMTIDES_LOCAL_ASSET_HOME = ".", JOURNEY_TEST_WORKERS = "2" }

[[step]]
name = "fuzz"
run = "npm run fuzz:engine -- --games 200"
stage = "release"
needs = ["dependencies"]
timeout = "30m"
```

`npm run review:gate` on a typical one-file change (a scratch commit
swapping `Math.max(0, value)` to `Math.max(value, 0)` in
`src/rules/journey/shop.ts`, then reset), `JOURNEY_TEST_WORKERS=2
DREAMTIDES_LOCAL_ASSET_HOME=.`, fresh worktree after `npm install` with no
prepared workspace and no typecheck build info, timed with
`/usr/bin/time -p`:

| Case | Steps | Wall | Host load (1 min) |
| --- | --- | --- | --- |
| One-file change, cold | prepare 0.7 s; lint 1.7 s beside typecheck 6.7 s; related tests 5.2 s (21 files, 349 tests) | **12.8 s** | 6.41 |
| One-line comment in `src/types/identifiers.ts` (warm build info) | prepare 0.3 s; typecheck 1.1 s beside lint 1.5 s; related tests skipped at 160 files (cap 40), 3.0 s to select | **5.0 s** | 5.39 |

The `dependencies` step (`npm ci`) is separate and not included. A
scratch commit that broke `clampEssence` failed `review:gate` with 2 failing
related test files out of 21.

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

**Incremental typecheck (corrected by hv-b8ef.12):** `review.mjs` ran
`tsc --noEmit --incremental`. That only helps a no-change rerun (1.7 s):
under `--noEmit` tsc cannot compare declaration signatures, so any edit,
even a function body, rechecks every dependent (`src/rules/journey/shop.ts`
body edit: check 15.9 s, wall 18.4 s). An earlier note here reported 1.4 s
for that edit; that run had build info that already held the edited text.
See [Phase 1 gate improvements](#hv-b8ef12-typecheck-signatures-and-seeding)
for the fix.

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
test file: 278 under `src/` plus the six tests of essential scripts that
survive Phase 2 (284 rows). Final tally: 223 keep, 41 rewrite (19 product
copy, 21 implementation detail, 1 statistical threshold), 20 delete.
Seventeen of the deletes cover systems Phase 2 removes (Firebase and RTDB
transport, co-op, Trox, identicons, editors, devtools, `/offers`) and
execute with those deletions; the three implementation-detail deletes and
the dead `src/draft/deck-cooccurrence` module landed in Phase 1.

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

### hv-b8ef.12: typecheck signatures and seeding

Retrospective finding: every bead starts in a fresh worktree, so its first
`npm run review` typechecked cold (15.1–16.1 s in hv-b8ef.4, .7, .8, .9,
.10), and later edits rechecked the whole program anyway (see the corrected
1.3 note).

Change: the typecheck step emits declarations only (`--noEmit false
--declaration --emitDeclarationOnly --outDir
node_modules/.cache/journey-review/declarations`), so tsc invalidates by
exported signature; non-exhaustive tasks seed missing build info from
`.git/journey-review/tsconfig.tsbuildinfo` and publish it after a passing
typecheck. `review:full` (the gate) never touches the shared copy.

Measured with `npm run typecheck` in a fresh worktree (host load 33–57):

| Case | Before | After |
| --- | --- | --- |
| Cold (no build info anywhere) | 18.4 s | 18.0 s |
| One-line body edit, warm | 18.4 s | 2.2 s |
| Fresh worktree, seeded, body edit present | 18.0 s (no seed) | 2.1, 2.0, 2.0 s |

Diagnostics are identical: an API change in `buyShopSlot` reports the same
26 errors incrementally and cold, and a deliberate type error in a seeded
worktree fails the step.

## Budget notes (Phase 1 retrospective)

Budgets are judged against runs at low host load. The host is shared:
Phase 1 gates took 253 s at low load and 427–656 s at load averages of
50–80 on 18 cores, with the `dependencies` step alone going from 10 s to
23 s for identical work. Friction lines now carry the host's
one-minute load average at commit time as `hostLoad` so overruns can be
attributed (starting with hv-b8ef.12). The budgets themselves are unchanged.

## Phase 1 gate re-measurement (2026-10-05, bead hv-b8ef.5)

Same commands as the 1.1 baseline, run in a fresh worktree at `release`
`64b81751`. The host load average was 49–55 at the start and 65–97 at the
end (the 1.1 baseline ran at low load), so wall times on unchanged work
roughly doubled: compare the "Unchanged work" rows to read the load factor
before reading the rows Phase 1 changed.

| Measurement | 1.1 baseline | Phase 1 gate | Changed by Phase 1? |
| --- | --- | --- | --- |
| prepare-workspace, cold / warm | 17.1 / 4.0–4.1 s | 26.1 / 6.2–6.3 s | Unchanged work |
| `trox:gate` | 24.5 s | 38.4 s | Unchanged work |
| `review:full` clean-game-data | 26.7 s | 44.5 s | Unchanged work |
| `review:full` lint (whole `src/`) | 18.4 s | 33.6 s | Unchanged work |
| `tsc --noEmit` | 10.2 s | 18.5 s | Unchanged work |
| `TIMING` lint of `src/` | 29.0 s | 52.7 s | Unchanged work; same rule ranking |
| `review:full` typecheck (cold) | 10.8 s | 18.6 s | Declaration emit, same cold cost |
| `review:full` test | 142.2 s | 234.1 s | 518 → 513 files, 5,187 → 5,153 tests |
| `review:full` total | 220.2 s | 366.2 s | |
| Vitest JSON per-file exec sum | 61.5 s | 123.8 s | Slowest: MobileBattleScreen 37.4 s, ExplorationSiteScreen 11.9 s |
| `npm run review`, one-line logic change | 65.2 s (typecheck 9.6 s, related tests 45.0 s at 1 worker) | 66.1 s (typecheck 2.1 s, related tests 46.3 s at 2 workers) | Typecheck −78% despite load; related tests held flat against the load factor |
| `npm run review`, docs only | 0.2 s | 0.5 s | |
| `npm run review`, one RON value | 9.9 s | 14.4 s | Unchanged work |
| `npm test -- src/rules/journey/shop.test.ts` | 15.7 s | 20.7 s | |
| Tollgate gate total | 256.2 s median | 482.4 s (hv-b8ef.12) | Load |

Phase 1's lasting gains are per-edit: the typecheck step drops from a full
recheck to about 2 s once build info exists, and a fresh worktree seeds it,
and related tests run on two workers. The gate itself shrinks in Phase 2,
which removes the Trox, RON, and Rust steps (about 80 s at this load).

## Budget revision (2026-10-05 replan)

The replan ([D19](../decisions.md#d19-test-pruning),
[D43](../decisions.md#d43-orchestrated-parallel-execution),
[D44](../decisions.md#d44-staged-validation)) revises the budgets. Reasons:

- The suite dominated every gate.
- The Phase 1 triage removed under 1% of tests.
- Gate time was mostly host load: 224 s at load 10 against 656 s at load
  46–94.

Every timing is now recorded with host load (`sysctl -n vm.loadavg`, 1-minute
value). Overruns are judged only at comparable load.

| Budget | Value | Measured as |
| --- | --- | --- |
| Full test suite, 2 workers, low host load | ≤ 60 s | `[review] test finished in` from `review:full` |
| Test files | ≤ 220 | `npx vitest list --filesOnly` count |
| `jsdom` test files | ≤ 80 | files with a `@vitest-environment jsdom` pragma |
| Gate stage (staged mode), one-file change | ≤ 60 s | sum of gate-stage step `elapsed_ms` per buildset |
| Release stage (staged mode) | ≤ 5 min | sum of release-stage step `elapsed_ms` per release run |
| Full Tollgate gate (interim mode) | ≤ 5 min | inactive while staged mode runs; kept for fallback ([Phase 2 gate](#budget-revision-phase-2-retrospective)) |
| Tollgate restart to healthy `doctor` | ≤ 30 s | Track T restart drill |
| Idle lane time | ≤ 15% of lane time | retrospective, from bead dispatch and close times |

The Phase 2.11 test cut must reach the first three. The rest are monitored
from the bead that introduces them.

## Engine performance targets (2026-10-05, bead hv-7x4l.10)

Measured against the
[engine performance targets](../engine-design.md#performance-targets), which
are monitored and never gated.

- Command: `npx tsx scripts/bench-engine.ts --games 100 --step-games 20 --interactive-games 20`
  (single process, seeded Random-policy fuzz games, the fuzz catalog). Wall
  34.7 s.
- Host load (1-minute): 11.25 at the start, 14.07 at the end. An earlier run
  of the same command without the view and determinization rows, at load
  5.96, measured within 4% of every row below.
- Each step and hash is timed as the median of 3 runs on the committed state
  the step started from.

| Target | Budget | Measured | Status |
| --- | --- | --- | --- |
| Random-policy full battles per core | ≥ 20/s | 10.5/s (100 battles, 50,132 steps; 189 µs per step including policy and decisions) | over budget |
| Median step (`runStep`) | < 50 µs | median 95.5 µs; p90 129.6, p99 150.9, max 1,053 µs (n = 10,150) | over budget |
| Clone plus hash | < 20 µs | median 155.5 µs; p90 165.2, p99 183.6 µs | over budget |
| Interactive re-run per answer, largest step | < 2 ms | max 1.567 ms; mean 0.342 ms (n = 133) | within |
| Planner iteration budget | fits 1.5 s at 3× M5 Max time | not measurable: the Planner arrives in Phase 7 | — |

Supporting measurements from the same run, all on committed states:

| Measurement | Median | p90 | p99 | Max |
| --- | --- | --- | --- | --- |
| Full-state hash (`stateHash`) | 78.5 µs | 83.2 µs | 90.9 µs | 156.0 µs |
| Cycle hash (`cycleHash`, mandatory-cycle checks) | 80.2 µs | 84.2 µs | 92.5 µs | 130.6 µs |
| Loop signature (`loopSignature`, per checkpoint) | 32.1 µs | 40.7 µs | 47.2 µs | 79.3 µs |
| View (`view`, every 10th state, both sides) | 11.2 µs | 22.6 µs | 32.6 µs | 42.6 µs |
| Determinization (`determinize` of a view) | 109.2 µs | 160.5 µs | 189.5 µs | 220.2 µs |

Findings:

- **Cloning dominates a step.** `cloneState` is a JSON round trip: clone plus
  hash (155 µs) minus the hash (78 µs) leaves about 77 µs, most of the
  95 µs median step. A structural clone or copy-on-write work state is the
  lever for the step and battle targets.
- **Hashing** costs about 80 µs per full or cycle hash (Phase 3.9 noted
  about 84 µs per step) and 32 µs per loop signature (3.9: about 40 µs per
  decision). A step computes a cycle hash only at power-of-two counts of
  consecutive automatic steps and a signature only at loop checkpoints, so
  neither is on every step.
- **The redaction invariant** adds about 11% to fuzz time: 30 games took
  11.8 s with it and 10.6 s at the parent commit, at load 6.7–7.2.

### 200-game fuzz

`npm run fuzz:engine -- --games 200`: 101,946 steps, 80.8 s (2.5 games/s),
1,507 prompts, 136 interactive re-runs (0.318 ms each), 0 failures. Wall
81.3 s. Host load 18.45 at the start, 8.01 at the end.

## Engine state copy and hashing (2026-10-05, bead hv-7x4l.21)

`cloneState` (`src/engine/state/clone.ts`) copies a state with typed object
literals for the instances, sides, turn, and Dreamwell and a JSON-semantics
structural copy (`copyJson`) for every other part. `stateHash` and
`canonicalHash` (`src/engine/state/hash.ts`) are a structural hash: an
object is the sum of mixed per-entry hashes, so no keys are sorted and no
JSON text is built, and each card instance is hashed as the ordered sequence
of its field values. `clone.test.ts` checks that the copy equals the JSON
round trip of every committed state of two seeded games, key order included,
shares no object, and keeps the hash; that the hash survives a JSON round
trip; and that changing any leaf of a state changes it. The committed states,
steps, and events of 60 seeded games were identical before and after, loop
signature and cycle hash strings aside.

- Command: `npx tsx scripts/bench-engine.ts --games 100 --step-games 20 --interactive-games 20`,
  run at the parent commit and then at this change, back to back on the
  same host (Apple M5 Max, Node 24.16.0).
- Host load (1-minute): 4.39 at the start of the parent run, 4.73 between
  the runs, 5.25 at the end. A separate run of this change at load 4.63
  measured clone plus hash at a median of 19.3 µs.

| Target | Budget | Before | After | Status |
| --- | --- | --- | --- | --- |
| Random-policy full battles per core | ≥ 20/s | 10.7/s (186.4 µs per step) | 40.3/s (49.5 µs per step) | within |
| Median step (`runStep`) | < 50 µs | 97.2 µs; p90 132.0, p99 158.8 | 16.7 µs; p90 36.0, p99 64.3 | within |
| Clone plus hash | < 20 µs | 155.7 µs; p90 167.9 | 19.9 µs; p90 23.1, p99 33.7 | at budget |
| Interactive re-run per answer, largest step | < 2 ms | max 1.673 ms; mean 0.360 | max 0.340 ms; mean 0.096 | within |

| Measurement (median) | Before | After |
| --- | --- | --- |
| Full-state hash (`stateHash`) | 77.7 µs | 16.4 µs |
| Cycle hash (`cycleHash`) | 79.5 µs | 34.9 µs |
| Loop signature (`loopSignature`) | 31.9 µs | 15.2 µs |
| View (`view`) | 11.4 µs | 11.7 µs |
| Determinization (`determinize`) | 109.6 µs | 112.0 µs |

Findings:

- **Clone plus hash sits at the budget**: 19.3 µs and 19.9 µs in two runs at
  load 4.6–4.7, so it moves over under heavier load. The copy is about 4 µs
  and the hash the rest; the card instances take about half of the hash and
  UUID strings about a quarter.
  The engine-purity lint rule bans module-level state, so the hash keeps no
  memo of recurring strings (one measured about 3 µs faster).
- **The cycle hash and loop signature** still build projected copies of the
  instances before hashing, which is most of their remaining cost. Neither
  runs on every step.

### 200-game fuzz

`npm run fuzz:engine -- --games 200`: 101,946 steps, 40.2 s (5.0 games/s),
1,507 prompts, 136 interactive re-runs (0.116 ms each), 0 failures. Wall
40.7 s. Host load 9.28 at the start, 7.62 at the end.

## Phase 2 gate (2026-10-09, bead hv-47xj.18)

### Re-measurement after Phase 2

Same commands as the 1.1 baseline where the step still exists, run in a
fresh worktree at `staging` `66bfe8661` after `npm install`. Environment:
`JOURNEY_TEST_WORKERS=2` and `DREAMTIDES_LOCAL_ASSET_HOME=.`, the values the
staged Tollgate policy sets for `review-gate` and `review-full` (the policy
sets no `TROX_ROOT`). One heavy command ran at a time. Host load is the
1-minute `sysctl -n vm.loadavg` value at the start of each run (end value
after the arrow where read); other sessions shared the host, and the load
stayed between 4.4 and 6.6 throughout.

| Measurement | 1.1 baseline | Phase 1 gate | After Phase 2 | Host load |
| --- | --- | --- | --- | --- |
| `npm ci --prefer-offline --no-audit --no-fund`, fresh `node_modules` | 5.8 s | — | 2.1 s (372 packages) | 6.01 |
| prepare-workspace, cold / warm | 17.1 / 4.0–4.1 s | 26.1 / 6.2–6.3 s | 0.71 / 0.28, 0.29 s (local art and Cumulus tokens only) | 5.69 |
| `trox:gate` | 24.5 s | 38.4 s | deleted in Phase 2 (2.4b) | — |
| `review:full` clean-game-data | 26.7 s | 44.5 s | deleted in Phase 2 (2.3) | — |
| `review:full` lint (whole `src/`) | 18.4 s | 33.6 s | 15.8 s, concurrent with typecheck | 6.14 → 5.58 |
| `tsc --noEmit` | 10.2 s | 18.5 s | 6.3 s | 6.60 → 6.39 |
| `TIMING` lint of `src/` (`TIMING=20 npx eslint src/`) | 29.0 s | 52.7 s | 22.1 s; same top two rules (`no-unsafe-assignment` 46%, `no-misused-promises` 31%); `dreamtides/no-raw-string-identity` 27 ms | 6.39 → 5.80 |
| `review:full` typecheck (cold) | 10.8 s | 18.6 s | 7.6 s, plus `typecheck-node` 2.6 s, both concurrent with lint | 6.14 → 5.58 |
| `review:full` test | 142.2 s | 234.1 s | **24.8 s**: 211 files, 2,238 tests | 6.14 → 5.58 |
| `review:full` total | 220.2 s | 366.2 s | **41.1 s** wall (`/usr/bin/time -p`) | 6.14 → 5.58 |
| Vitest JSON per-file exec sum | 61.5 s | 123.8 s | 12.2 s (wall 19.8 s, 211 files, 2,238 tests, 0 failures); slowest `src/engine/fold/fold.test.ts` 2.3 s, `src/engine/core.test.ts` 1.6 s, `src/engine/state/clone.test.ts` 0.9 s, `ExplorationSiteScreen` 0.5 s, `MobileBattleScreen` 0.4 s | 4.39 → 4.68 |
| `npm run review`, one-line logic change (`src/rules/journey/shop.ts`, `pricePaid > journey.essence` → `journey.essence < pricePaid`) | 65.2 s | 66.1 s | 10.4 s, 9.0 s: lint 1.8 / 1.7, typecheck 1.2 / 1.0 (+ node 0.9 / 0.7), related tests 6.6 / 5.6 s (25 files, 293 tests) | 4.54, 4.45 |
| `npm run review`, docs only (newline appended to `docs/design.md`) | 0.2 s | 0.5 s | 0.19 s, no applicable checks | 4.84 |
| `npm run review`, one RON value | 9.9 s | 14.4 s | deleted in Phase 2 (2.3) | — |
| `npm run review`, one TS data value (`src/content/shop.ts` dreamsign price 50 → 55), the RON row's successor | — | — | 22.2 s: related tests 18.0 s (127 files, 1,321 tests) | 4.78 → 5.23 |
| `npm test -- src/rules/journey/shop.test.ts` | 15.7 s | 20.7 s | 1.9 s, 1.9 s (prepare 0.3, test 1.4) | 4.84 |
| `npx vitest run src/rules/journey/shop.test.ts` | 9.0 s | — | 1.7 s | 4.77 |
| `npm run fuzz:engine -- --games 200` (local) | — | — | 36.4 s wall; 101,946 steps, 0 failures | 4.55 → 4.50 |

Vitest summary for the `review:full` test step: duration 24.2 s (transform
6.8 s, setup 0.5 s, import 20.8 s, tests 13.6 s, environment 10.0 s;
cumulative across 2 workers). Import still leads, at about a seventh of its
1.1 cost.

### Tollgate stage totals

Per-buildset sums of step `elapsed_ms` from the primary checkout's
`.git/tollgate/state.sqlite3`, opened read-only (`sqlite3 -readonly`), with
the [Gate total](#gate-total) query; passed buildsets only. Tollgate history
does not record host load; each bead's friction file carries `hostLoad`.

| Stage | Sample | Median | Range | Steps (median) |
| --- | --- | --- | --- | --- |
| Gate stage (staged mode) | last 20 candidates, `402593c7b` … `66bfe8661` | **17.2 s** | 12.6–24.0 s | `dependencies` ≈ 4 s, `review-gate` 8.5–19.0 s |
| Release stage (staged mode) | same 20 | **86.2 s** | 82.8–91.4 s | `review-full` 43.9 s (41.5–47.7), `fuzz` 37.7 s (36.7–40.5) |
| Gate stage, all staged-mode history | 52 | 17.5 s | 12.6–40.6 s | |
| Release stage, all staged-mode history | 52 | 92.6 s | 82.8–150.6 s | |
| Interim mode after the Trox step left (`dependencies` → `review`) | 29 | 61.0 s | 45.3–82.6 s | |

Against the Phase 1 gate (482.4 s for hv-b8ef.12, 256.2 s median at low
load), a candidate now waits about 17 s for the gate stage, and the whole
release run sums to under 1.5 minutes.

### D19 suite budgets

| Budget | Limit | Measured | Command | Host load | Status |
| --- | --- | --- | --- | --- | --- |
| Full suite wall, 2 workers | ≤ 60 s | 24.8 s | `[review] test finished in` from `review:full` | 6.14 | met |
| Test files | ≤ 220 | 211 | `npx vitest list --filesOnly \| wc -l` (also `git ls-files` of `src/`, `scripts/`, `eslint-rules/` test files: 211) | 5.46 | met |
| `jsdom` test files | ≤ 80 | 49 | `git grep -l "@vitest-environment jsdom"` over test files | — | met |

### Other budgets at this gate

| Budget | Value | Measured | Host load | Status |
| --- | --- | --- | --- | --- |
| `npm run review`, one-file logic change | ≤ 45 s | 9.0–10.4 s | 4.45–4.54 | within |
| `npm run review`, docs only | ≤ 5 s | 0.19 s | 4.84 | within |
| `npm run review`, one-value data change | ≤ 20 s | 22.2 s (TS data module) | 4.78 | over by 11%: a `src/content/` module selects 127 related test files |
| Focused test file | ≤ 10 s | 1.9 s | 4.84 | within |
| Typecheck step | ≤ 10 s | 7.6 s cold | 6.14 | within |
| Lint, whole `src/` | ≤ 20 s | 15.8 s | 6.14 | within |
| Workspace prepare, warm | ≤ 5 s | 0.28–0.29 s | 5.69 | within |
| Gate stage (staged mode) | ≤ 60 s | 17.2 s median | — | within |
| Release stage (staged mode) | ≤ 5 min | 86.2 s median | — | within |
| Fuzz smoke | ≤ 60 s | 37.7 s median `fuzz` step; 36.4 s local | 4.55 (local) | within |

### Budget revision (Phase 2 retrospective)

| Budget | Value | Measured as | Reason |
| --- | --- | --- | --- |
| Fuzz smoke, `npm run fuzz:engine -- --games 200` | ≤ 60 s | the release-stage `fuzz` step's `elapsed_ms` | The command exists and runs on every release (35.7–41 s since hv-7x4l.21); the budget catches a regression in engine step cost before it slows releases. |
| Full Tollgate gate (interim mode) | ≤ 5 min | inactive | Staged mode has run since T9 (hv-ki3p.10), so no interim-mode gate runs. The budget applies again if the policy falls back to interim mode. |

**Test-file headroom.** 211 test files against the D19 cap of 220 (9 left)
and the Phase 3 ceiling of 212 from hv-47xj.22; 49 `jsdom` files against 80
and the Phase 3 ceiling of 50. Phase 3 engine beads have already added files
since hv-47xj.22 measured 206. The Phase 4 gate re-checks the headroom.

### Phase 2 measurement files

Folded from `measurements/<bead-id>.md`; each file keeps the full tables.

- **hv-47xj.9 (2.4b Delete Trox).** 54 files deleted (Trox config,
  `localization/`, `vendor/trox-runtime/`, runtime localization, 15 scripts
  and tests); 8 test files (−699 lines); 13 npm scripts and `@trox/runtime`
  with 11 lockfile packages; the `trox-source-check` review step and the
  localized-runtime workspace generator. Diff +281/−19,694. A clean clone
  without `cargo`/`rustc` passed `npm ci` (5 s) and `review:full` (61 s,
  load 6.63 → 7.90; 224 files, 2,374 tests). The Tollgate policy dropped the
  `trox` step and the `tools/game-data/target` cache (digest
  `68c1e461196b…`).
- **hv-47xj.14 (2.7a Cull scripts and dependencies).** `scripts/` 66 → 32
  files, npm scripts 28 → 15, devDependencies 23 → 17, 88 fewer lockfile
  packages. Lint wall unchanged (`lint:full` 13.4 → 13.8 s at load
  7.74 / 4.17): ESLint covers `src/` only. `review:full` 56 s at load 4.19
  (192 files, 2,089 tests). 17 test files deleted, net −1,863 lines.
- **hv-47xj.15 (2.7b Cull custom ESLint rules).** Rule modules 18 → 8,
  restriction blocks 6 → 2, `eslint-rules/` 6,738 → 2,008 lines. Custom
  rules cost about 0.2 s of about 19 s of rule CPU, so whole-`src/` lint
  stays at 13–16 s (alternating runs at load 10.8–12.6). 14 test files
  deleted, net −2,662 lines; `review:full` 45.9 s at load 9.09.
- **hv-47xj.22 (2.11d Suite speed and D19 budgets).** `isolate: false` for
  the shared project, with `vi.mock` files in an isolated project and a setup
  file that restores jsdom globals and resets modules per file; green across
  eight shuffled seeds. Suite wall 29.7 → 20.8 s median (load 4.4–5.5).
  `review:full` overlaps lint and typecheck: 50 → 35 s back to back (load
  5.03 / 4.83). Budgets met at 206 files and 50 `jsdom` files; it set
  per-phase test-file ceilings for Phases 3–7.
- **hv-47xj.25 (identity audit as an ESLint rule).** The domain-string
  audit test became `dreamtides/no-raw-string-identity`. `npm run review` for
  a one-line `src/` change: 16.2 / 17.2 s before (load 8.04 / 9.12), 14.2 /
  13.5 s after (load 5.56 / 5.23); the selection drops the 1.6 s audit test.
  `lint:full` 14.6 s at load 5.70, zero findings.

### Browser smoke

Dev server `npm run dev -- --port 5174 --strictPort` from the gate
worktree; Playwright MCP; `window.__caps` installed after each full
navigation and read after each action: empty at every read. Captures are in
the primary checkout's `artifacts/qa/hv-47xj.18/`.

| Viewport | Flow | Result | Captures |
| --- | --- | --- | --- |
| Desktop 1440×900 | `/` (no saved game) → avatar select → Choose → starting deck → Begin Journey → Draft 5x twice, Dreamsign Revelation (declined), Purge (declined) → Battle unlocks → Battle Start → Begin Battle | battle screen mounted: player and enemy status, 5 hand cards, Battle Start control gone | `front-door-desktop.png`, `battle-start-desktop.png` |
| Mobile 390×844 | `/` resumed the desktop game on its battle (front-door resume); `/?seed=7` started a new game → same flow | battle screen mounted, 5 hand cards; `scrollWidth` 390 (no horizontal scroll); Begin Battle at 237,693, 128×42 | `front-door-mobile.png`, `battle-start-mobile.png` |

### Exit gate

| Check | Evidence | Result |
| --- | --- | --- |
| Three docs and one skill | Tracked Markdown outside `docs/plan/`: `README.md`, `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`), `docs/design.md`, `docs/rules.md`, `.llms/skills/cumulus/SKILL.md`. `.claude/skills` and `.codex/skills` are symlinks to `.llms/skills`. | pass |
| No RON | `git ls-files '*.ron'`: 0 | pass |
| No Rust | `git ls-files '*.rs' Cargo.toml '**/Cargo.toml' Cargo.lock`: 0; no `tools/` | pass |
| No Firebase | `grep -i firebase package.json package-lock.json` and `git grep -i firebase` over `src`, `scripts`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`: no matches | pass |
| No Trox or localization | `git grep -i trox` over `src`, `scripts`, `eslint-rules`, `package.json`, configs: no matches; no tracked path contains `trox`; no `localization/`, `src/runtime/localization/`, `tx(`, `txa(`, or `LocalizedString` | pass |
| No co-op | no `src/coop/`; no room or transport code. Remaining identifiers: the log compatibility tag `dreamtides-coop-v26` (`src/session/reducer-version.ts`, `src/types/reducer-version.ts`) and comments in `src/rules/battle/fold.ts` and `src/rules/battle/apply-debug-edit.ts` (legacy battle that Phases 3–4 replace) | pass |
| No editors | `src/root-router.tsx` renders one route (`RootRouteId = "journey"`); no `src/editor/`, `src/cumulus/docs/`, `src/devtools/`; no `tabula/`, root `cumulus/`, `saved-journeys/`, `.superpowers/` | pass |
| No analysis tooling | no tracked first-pick, analysis, experiment, or metrics scripts; `src/draft/` holds `draft-engine.ts` (tides4) and `pool/` | pass |
| Data in typed TS modules | catalogs are TS under `src/content/` (781 tracked files). Non-TS files under `src/` are assets, Boxicons, replay test fixtures, and `src/battle/semantic-play-card-ids.json`, a UUID list in the legacy battle sandbox imported by `src/battle/semantic-play.ts` and `src/data/tutorial-actions.ts` | pass |
| Local-first log | `LocalLog` (`src/eventlog/local-log.ts`) over IndexedDB (`src/session/indexeddb-store.ts`); no `fetch(`, `WebSocket`, or `EventSource` in `src/eventlog/` or `src/session/` | pass |
| Scripts culled | `scripts/`: 26 tracked files, 17 non-test modules, 4,562 lines (baseline 201 scripts, ~51k lines); 18 npm scripts | pass |
| Lint rules culled | 10 custom rule modules (the 8 kept by 2.7b, `engine-purity` from Phase 3, `no-raw-string-identity` from hv-47xj.25) plus the `cumulus-token-index.js` helper, and 2 restriction blocks (determinism in `src/rules/`, `localeCompare` in `generateAuguryEncounter.ts`); baseline 45 | pass |
| D19 budgets | [above](#d19-suite-budgets): 24.8 s, 211 files, 49 `jsdom` | pass |
| Mason beads landed | the orchestrator confirms every hv-47xj mason bead closed; friction files exist for hv-47xj.9 … .57 | pass |
| Retrospective beads landed | hv-47xj.54 `7eda7b8aa`, hv-47xj.55 `e328a6405`, hv-47xj.56 `dfd89933d` | pass |
| Metrics re-measured | this section | pass |
| Review resolved | findings resolved; follow-up hv-47xj.57 landed as `66bfe8661` | pass |

## Phase 3 gate (2026-10-09, bead hv-7x4l.12)

### Re-measurement after Phase 3

Run in a fresh worktree at `staging` `1530cd16f` after `npm install`, with
`JOURNEY_TEST_WORKERS=2` and `DREAMTIDES_LOCAL_ASSET_HOME=.` (the staged
Tollgate policy's `review-gate` and `review-full` environment). One heavy
command ran at a time; other sessions shared the host. Host load is the
1-minute `sysctl -n vm.loadavg` value at the start of each run, with the end
value after the arrow.

| Measurement | Phase 2 gate | After Phase 3 | Host load |
| --- | --- | --- | --- |
| `review:full` lint (whole `src/`) | 15.8 s | 15.3 s, concurrent with typecheck | 8.17 → 6.69 |
| `review:full` typecheck (cold) | 7.6 s, plus `typecheck-node` 2.6 s | 7.3 s, plus `typecheck-node` 2.6 s | 8.17 → 6.69 |
| `review:full` test | 24.8 s: 211 files, 2,238 tests | **23.9 s**: 211 files, 2,309 tests | 8.17 → 6.69 |
| `review:full` total | 41.1 s | **40.0 s** wall (`/usr/bin/time -p`) | 8.17 → 6.69 |
| Vitest JSON per-file exec sum (`npx vitest run --reporter=json`) | 12.2 s | 12.7 s (wall 21.0 s, 0 failures); slowest `src/engine/fold/fold.test.ts` 2.8 s, `src/engine/core.test.ts` 1.9 s, `src/engine/state/clone.test.ts` 1.0 s, `ExplorationSiteScreen` 0.5 s, `MobileBattleScreen` 0.4 s | 5.64 → 5.16 |
| `npx vitest run src/engine` | — | 5.1 s wall (vitest 4.4 s): 27 files, 417 tests | 4.84 → 4.77 |

### Engine tests' share of the suite

From the same JSON reporter run; engine tests are the test files under
`src/engine/`.

| Measure | Engine | Whole suite | Share |
| --- | --- | --- | --- |
| Test files | 27 | 211 | 12.8% |
| Tests | 417 | 2,309 | 18.1% |
| Per-file exec time (sum) | 6.2 s | 12.7 s | 48.7% |

The engine's 27 files carry about half of the suite's test time: the three
seeded-game files (`fold.test.ts`, `core.test.ts`, `clone.test.ts`) alone
take 5.6 s. The engine has 190 non-test files (15,571 lines) and 7,833 lines
of tests.

### Tollgate stage totals

Per-buildset sums of step `elapsed_ms` from the primary checkout's
`.git/tollgate/state.sqlite3`, opened read-only, with the
[Gate total](#gate-total) query; passed buildsets only, for commits carrying
a `Bead: hv-7x4l.*` trailer. Staged mode covers 33 of the phase's 45
commits, `8c401bc94` (hv-7x4l.8) … `1530cd16f` (hv-7x4l.47); the earlier
ones ran in interim mode.

| Stage | Sample | Median | Range | Steps (median) |
| --- | --- | --- | --- | --- |
| Gate stage (staged mode) | last 20, `97ab705a6` … `1530cd16f` | **17.3 s** | 11.7–24.1 s | `dependencies` 4.7 s, `review-gate` 12.5 s (7.9–19.0) |
| Release stage (staged mode) | same 20 | **86.2 s** | 83.2–104.5 s | `review-full` 43.4 s (42.0–51.3), `fuzz` 38.0 s (36.9–46.6) |
| Gate stage, all Phase 3 staged runs | 33 | 17.4 s | 11.7–25.4 s | |
| Release stage, all Phase 3 staged runs | 33 | 86.9 s | 83.2–131.6 s | `fuzz` 38.1 s (36.8–81.1) |

Both stages match the Phase 2 gate (17.2 s and 86.2 s) while the suite grew
by 71 engine tests. `release` and `staging` both point at `1530cd16f`.

### D19 suite budgets

| Budget | Limit | Phase 3 ceiling (hv-47xj.22) | Measured | Command | Host load | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Full suite wall, 2 workers | ≤ 60 s | ≤ 60 s | 23.9 s | `[review] test finished in` from `review:full` | 8.17 | met |
| Test files | ≤ 220 | 212 | 211 | `npx vitest list --filesOnly \| wc -l` (also `git ls-files` of test files: 211) | 6.39 | met |
| `jsdom` test files | ≤ 80 | 50 | 49 | `git grep -l "@vitest-environment jsdom"` over test files | — | met |

No test file was added after the Phase 2 gate: the later Phase 3 beads
added 71 tests to existing engine test files (2,238 → 2,309). The Phase 4
ceilings are 212 files and 55 `jsdom` files.

### Other budgets at this gate

| Budget | Value | Measured | Host load | Status |
| --- | --- | --- | --- | --- |
| Typecheck step | ≤ 10 s | 7.3 s cold | 8.17 | within |
| Lint, whole `src/` | ≤ 20 s | 15.3 s | 8.17 | within |
| Gate stage (staged mode) | ≤ 60 s | 17.3 s median | — | within |
| Release stage (staged mode) | ≤ 5 min | 86.2 s median | — | within |
| Fuzz smoke | ≤ 60 s | 38.0 s median `fuzz` step; 36–38 s local across beads (5.4–5.8 games/s) | 3.9–4.9 (bead friction files) | within |

The engine performance targets were last measured by
[hv-7x4l.21](#engine-state-copy-and-hashing-2026-10-05-bead-hv-7x4l21); the
Planner target waits for Phase 7.

### Fuzz soak

Each soak ran 10,000 games of `npm run fuzz:engine` as 2 processes × 5,000
(seed `soak`, `--interactive-every 10`) in the background under the D17 soak
conditions.

| Run | Commit | Host load | Games | Interactive re-runs | Failures | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Soak 1 | `b20630f26` | 6.3–7.0 | 10,000 | 7,350 | 1 | `soak-792`: a play the legality check offered reached payment unable to pay 1●. hv-7x4l.38 (`20ee87515`) made legality an existential bounded search that matches payment. |
| Soak 2 | `df95db214` | 5.0–10.0 | 10,000 | 7,298 (≥ 10% of games) | **0** | 0 feasibility bounds reached; 5.3–5.4 games/s per process; interactive re-run 0.26–0.28 ms each |

### Phase 3 measurement files

Folded from `measurements/<bead-id>.md`; each file keeps the full tables.

- **hv-7x4l.3 (3.3 Prompt protocol).** `npm run fuzz:engine -- --games 1000`
  with every 10th game replayed through the fold, suspending at every prompt,
  at load 15.4: 541,035 steps, 5,286 inline prompts, 488 interactive
  re-runs at a mean of 0.065 ms each (target < 2 ms for the largest step),
  7.5 games/s including invariants and both replays, 0 failures.
- **hv-7x4l.37 (3.12 Adversarial check).** 99 realistic rules regressions,
  each injected alone into `src/engine/` on base `b20630f26` and run against
  the 27 engine test files: 6 rejected as equivalent at the engine's public
  boundary, 93 valid, 76 killed initially. Each of the 17 survivors gained a
  regression test that fails with its mutation and passes without it, so the
  engine suite kills all 93, including all 44 in the step runner and prompt
  protocol (12 of whose survivors were answer validation, fingerprint
  fields, `cancellable` marking, attempt counters, and loop-replay prompts).
  No production bug was found; the final production diff is empty. Final
  `vitest run src/engine` 4.6 s (355 tests) and 200-game fuzz 35.8 s, both
  at load 4.5.

### Exit gate

| Check | Evidence | Result |
| --- | --- | --- |
| The engine enforces all of `docs/rules.md` | hv-7x4l.1 (`9c613f114`) wrote the priority, trigger, copy, loop, and card-text rules, adding § Durations, § Figments → Figment Copies, and § Infinite Loops (Optional Loops, Mandatory Loops); 52 rules decisions in `rules-decisions/` (RD-hv-7x4l.1-1 … RD-hv-7x4l.46-1). Clarified during the phase: § Objective → Victory check ("you win the game", hv-7x4l.43, C15), § Targeting (untargetable before resolution, hv-7x4l.45, C17), § Spark (which gains trigger "when … gains ✦", hv-7x4l.46, C17), § Infinite Loops (turn log outside the optional-loop signature, hv-7x4l.36; choices as decisions and the Brent window, hv-7x4l.20), § Ability Types ('when you play' on effective types, hv-7x4l.34). Review findings landed as hv-7x4l.38–.42, .44 and .47. The engine's tests check these rules with synthetic fixtures from `src/engine/testing/`. Known gap: printed card text takes effect only as Phase 5 authors it (516 of 521 cards, every Avatar, and every Dreamwell card are pending). | pass |
| The prompt protocol is proven by property tests and the soak | `src/engine/fold/fold.test.ts`: inline and interactive equivalence (12 seeded games, suspending at every prompt), suspension (divergence, reload mid-prompt, sides alternating within a step, forced auto-answers), cancellation before and after the commit point, empty candidate sets, prompt ids across attempts, corrupt in-flight records, answers from an answer source. `src/engine/core.test.ts` replay (seeded games, invariants, final-hash replay); `src/engine/prompts/answers.test.ts` (answer validation, fingerprints, enumeration); `src/engine/loops/loops.test.ts` (loop replay). Soak 2: 10,000 games, 7,298 interactive re-runs, 0 failures. Adversarial check: all 44 step-runner and prompt-protocol mutations killed. | pass |
| Every entity is `pending` or `vanilla` | `src/engine/content-gates.test.ts` passes. Cards 521 (516 pending, 5 vanilla), dreamsigns 153 (152 pending, 1 vanilla), avatars 32 pending, Dreamwell cards 33 pending. Figments 10: 7 vanilla and 3 authored (`src/content/figments/wraith-c5a98a5b.ts`, `ember-361b4942.ts`, `legionnaire-e757b306.ts`). The 3 authored figments are the 3.8 figment catalog, which § 3.8 scopes into this phase; they pass the gate's authored-entity checks. | pass, with the 3.8 figment catalog authored |
| Every mason bead filed this phase has landed | hv-7x4l.22 `05d135c5d`, .23 `03bd571b5`, .24 `0fa03a6da`, .25 `7a1ba6815`, .26 `97ab705a6`, .27 `e02c523c3`, .28 `105574218`, .29 `a6727bd08`, .30 `3f2975a96`, .31 `402593c7b`, .32 `54423eea8`, .33 `1e36eeb36`; the orchestrator confirms each closed | pass |
| The retrospective's improvement beads have landed | Phase 2 gate retrospective (hv-47xj.18, 34 Phase 3 beads): `bead-areas-incomplete` → hv-47xj.55 `e328a6405`; `domain-string-audit-engine-ids` → hv-47xj.25. Phase 3 gate retrospective: hv-7x4l.48 `ec53af159` (its invariant found real leaks, fixed first by prerequisites hv-7x4l.50 `219ec3d3c` and hv-7x4l.51 `17fd0bece`) and hv-7x4l.49 `b772c3630` (which also cut the invariant's fuzz cost from +23% to +0.2% wall; release-stage `fuzz` step 48.8 s → 39.2 s). | pass |
| The retrospective covers the phase | A second retrospective (2026-10-09, hv-7x4l.12) covered hv-7x4l.37–.47 and this bead (`introspection.jsonl`). It filed hv-7x4l.48 (fuzz invariant: no visible event names a hidden card; leaks found by review in .17, .44, .47) and hv-7x4l.49 (`npm run perf:ab`, base-vs-head engine performance with CPU time; `host-load-noise` in .10, .21, .44). Dispositioned without beads: review follow-up churn (D18), vitest synchronous hangs (2 beads), Areas engine plumbing (1 of 8 beads after hv-47xj.55). `npm run friction:triggers` exits 0 with no retrospective due. | pass |
| The reviews are resolved | Codex gpt-5.6-sol. Phase diff: 6 findings, 5 accepted (greedy legality hv-7x4l.38, conditional victory .39, untargetability .40, additional spark .41, copy choices .42) and 1 rejected (authored figments are 3.8 scope). hv-7x4l.38 review: 5 accepted → hv-7x4l.44. Follow-up range review: 1 accepted → hv-7x4l.47, 1 rejected (fingerprint ordering: the memo is keyed by immutable state). Rules-text beads hv-7x4l.43, .45, .46 landed with their RD files; hv-7x4l.50 added RD-hv-7x4l.50-1 and -2 (discards are seen as they enter the void; a trigger's hidden subject stays hidden). | pass |
| D19 budgets | [above](#d19-suite-budgets-1): 23.9 s, 211 files, 49 `jsdom` | pass |
| Metrics re-measured | this section, measured at `1530cd16f`; the closing bead confirms `release == staging` in its notes | pass |
