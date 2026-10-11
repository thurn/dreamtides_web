# hv-umm2.356 measurements (whole suite over the gate's related cap)

`review:gate` runs the related tests of a candidate's diff against `HEAD^`
when at most `GATE_RELATED_TEST_FILE_CAP` (40) test files are related, and
the whole suite over that. Every heavy run below took the heavy slot
(`lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock`) with
`JOURNEY_TEST_WORKERS=2`; the gate runs also set
`DREAMTIDES_LOCAL_ASSET_HOME=.`, as Tollgate's `review-gate` step does.
CPU is user plus system time from `/usr/bin/time -p`. Load is
`sysctl -n vm.loadavg`'s 1-minute value.

## Full suite or uncapped related selection

The diff of `d0f45c58e` (the `putInDeck` primitive, Augur Crow and The
Power Within: 15 files under `src/`), five interleaved rounds in this
worktree with a prepared workspace, Vitest CLI (`vitest related --run` with
the changed files, then `vitest run`):

| Round | Related wall | Related CPU | Whole suite wall | Whole suite CPU | Load |
| --- | --- | --- | --- | --- | --- |
| 1 | 25.38 s | 68.20 s | 33.60 s | 83.99 s | 12.7 → 19.3 |
| 2 | 28.05 s | 75.87 s | 31.86 s | 80.69 s | 19.3 → 16.5 |
| 3 | 26.57 s | 71.35 s | 28.30 s | 70.76 s | 16.5 → 9.8 |
| 4 | 25.25 s | 67.34 s | 28.52 s | 71.74 s | 9.8 → 6.2 |
| 5 | 24.86 s | 67.11 s | 29.06 s | 72.78 s | 6.2 → 6.0 |
| **Median** | **25.38 s** | **68.20 s** | **29.06 s** | **72.78 s** | |

The related selection is 158 files and 2,279 tests; the whole suite is 216
files and 2,905 tests. The suite costs a median 3.7 s wall and 4.6 s CPU
more (about 14% and 7%), within a few seconds, so the gate runs the whole
suite: it is the simpler rule, and it reaches tests outside the changed
files' import graph, such as a registry or contract another candidate
changed.

## Snapshots of the two untested conflicts

Detached snapshots at each offending commit, outside the repository, after
`npm ci --prefer-offline --no-audit --no-fund`; the previous script first,
then this bead's `scripts/review.mjs`, `review-plan.mjs`,
`review-related-tests.mjs` and `review-plan.test.mjs` copied in. Typecheck
build info was removed before each run, so every typecheck ran cold as in
Tollgate. Wall excludes the `dependencies` step.

| Commit | Script | Test step | Result | Wall | CPU | Load |
| --- | --- | --- | --- | --- | --- | --- |
| `035f9058f` | previous | skipped: 158 related files over the cap, 3.6 s | pass | 12.04 s | 35.7 s | 3.3 → 3.9 |
| `79aceda65` | previous | skipped: 157 related files over the cap, 3.7 s | pass | 12.07 s | 34.6 s | 3.9 → 3.7 |
| `035f9058f` | this bead | whole suite (159 related), 28.5 s | **fail**: 3 files, 5 tests | 36.92 s | 96.3 s | 4.3 → 4.7 |
| `79aceda65` | this bead | whole suite (158 related), 28.7 s | **fail**: 4 files, 6 tests | 36.69 s | 95.1 s | 4.7 → 3.9 |

- `035f9058f` fails the prompt-lab tooling, presentation-completeness, and
  prompt-surface tests: the `shuffle-into` lab fixture bounces with
  `illegalAnswer` because its card shares a UUID with the choose-player
  fixture (the duplicate lab card that hv-umm2.351 repaired).
- `79aceda65` fails the same tests plus the `shuffleInto` rollback contract
  in `src/engine/effects/primitives/contracts.test.ts` (the published-prefix
  knowledge change that hv-umm2.353 repaired).

## Under the cap

`review:gate` in this worktree before committing: 1 related test file for
4 changed files, test step 3.4 s, 12.27 s wall, load 3.8.

## Gate-stage median

Before: 19.9 s median over 37 code candidates (Phase 5 retrospective
hv-umm2.355), with 22 of about 30 code gates skipping their tests. After:
the over-cap runs above take about 37 s locally plus the `dependencies`
step's 4.3 s median (Phase 4 gate), about 41 s, inside D44's 60 s. The
Tollgate gate-stage median over at least 10 code candidates after this
change is read at the next phase gate or retrospective.
