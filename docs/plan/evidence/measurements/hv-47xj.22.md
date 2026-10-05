# hv-47xj.22 measurements (suite speed and D19 budgets)

Host: 18 cores. Every timing below has the 1-minute `sysctl -n vm.loadavg`
value read just before the run. Other lanes shared the host throughout, so
compare rows measured side by side, not rows taken at different loads.
Suite walls are `JOURNEY_TEST_WORKERS=2 vitest run` after
`prepare-workspace`. "Before" is base `9dd8575c0`; "after" is this bead.

## D19 budgets

| Budget | Limit | Before | After | Status |
| --- | --- | --- | --- | --- |
| Full suite wall, 2 workers | ≤ 60 s | 29.3 s (load 12.04) | 20.1–21.7 s (load 4.4–5.5) | met |
| Test files | ≤ 220 | 206 | 206 | met |
| `jsdom` test files | ≤ 80 | 50 | 50 | met |

File counts use `git ls-files | grep -E '^(src|scripts|eslint-rules)/.*\.(test|spec)\.'`.
`jsdom` files are those with a `@vitest-environment jsdom` pragma. The test
count drops from 2,096 to 2,092; test lines drop by 460.

## App-wide tests

Related-test selection reaches `src/App.test.tsx` and
`src/components/ScreenRouter.test.tsx` from most UI edits. Base `9dd8575c0`
has no `src/root-router.test.tsx` and no `FrontDoorRouter` test. Verdicts are
in `test-triage/hv-47xj.22.jsonl`. Together the two files ran in 2.0 s before
and 1.8 s after (load about 7), so their slimming matters for review
selection, not for the full-suite wall.

## Suite wall, 2 workers

Side-by-side runs on the current test files, alternating the base Vitest
config (`isolate` default, base setup file) with this bead's config:

| Run | Config | Load (1 min) | Wall | Import (cumulative) | Environment (cumulative) |
| --- | --- | --- | --- | --- | --- |
| 1 | base | 4.45 | 28.8 s | 23.7 s | 10.5 s |
| 1 | after | 4.40 | 21.7 s | 19.1 s | 8.4 s |
| 2 | base | 4.83 | 29.7 s | 25.4 s | 10.8 s |
| 2 | after | 4.64 | 20.1 s | 17.6 s | 7.5 s |
| 3 | base | 4.99 | 30.8 s | 26.7 s | 10.8 s |
| 3 | after | 5.48 | 20.8 s | 18.4 s | 7.8 s |

The median wall falls from 29.7 s to 20.8 s (30%). The untouched base, with
the base test files, ran in 29.3 s at load 12.04.

## `isolate: false`

Kept. The shared project runs with `isolate: false`; files that call
`vi.mock`/`vi.doMock` (25 today, detected when the config loads) run in an
isolated project.

| Attempt | Load (1 min) | Wall | Result |
| --- | --- | --- | --- |
| `--no-isolate`, no fixes | 7.58 | 14.4 s | 7 files, 16 tests fail |
| One shared project, setup resets modules and jsdom globals, default order | 5.93 | 18.9 s | green |
| Same, `--sequence.shuffle.files --sequence.seed=303` | 6.24 | 22.5 s | 1 file fails |
| Same, seed 404 | 6.40 | 23.8 s | 2 files fail |
| Final config, setup without the jsdom restore, seed 101 | n/a | n/a | `tutorial-overlay.test.tsx` fails |
| Final config, setup without the jsdom restore, seed 404 | n/a | n/a | `offer-screens.test.tsx` fails |

The failures had three causes:

- **jsdom globals.** One jsdom window serves every file in a worker. Files
  replace `requestAnimationFrame`, `matchMedia`, `visualViewport`,
  `ResizeObserver`, `HTMLElement.prototype.animate`, and similar, often
  without restoring them. `src/testing/dom-globals.ts` snapshots the fresh
  window's own properties (globals, `document`, `navigator`, and the element
  prototypes) and restores them before each file. That includes values
  assigned through jsdom's global accessors, which keep overrides in a
  private map.
- **Module state.** Without isolation the module registry persists, so a
  module evaluated by one file carried its state (and its mocked
  dependencies) into the next. The setup file calls `vi.resetModules()`
  before each file, so source modules evaluate afresh while externalized
  dependencies and the jsdom window stay warm.
- **Module mocks.** Vitest records a mock on the mocked module's cached node
  (`meta.mockedModule`), and `vi.resetModules()` keeps those nodes, so a mock
  from one file reached later files (seeds 303 and 404 above). No test-side
  fix applies, so mocking files run in the isolated project.

The setup file also calls `vi.useRealTimers()`, `vi.unstubAllGlobals()`, and
`vi.unstubAllEnvs()` before each file; Vitest itself restores spies after
each file. No test file needed editing.

Determinism, final config, all green with 206 files and 2,092 tests:

| Seed (`--sequence.shuffle.files`) | Load (1 min) | Wall |
| --- | --- | --- |
| 11 | 7.13 | 23.8 s |
| 22 | 6.89 | 24.0 s |
| 33 | 5.82 | 27.5 s |
| 101 | 5.09 | 25.4 s |
| 202 | 10.06 | 29.3 s |
| 303 | 3.54 | 24.7 s |
| 404 | 3.54 | 24.3 s |
| 505 | 19.41 | 31.7 s |
| default order | 13.83 | 21.6 s |

`--sequence.seed` alone changes nothing unless shuffling is on, so these runs
shuffle file order, which also changes how files group into workers. Shuffled
runs are a few seconds slower because the `node` and `jsdom` environments
interleave within a worker.

## Lint and typecheck in `review:full`

Measured directly with a cold typecheck (build info deleted, as in the gate):

| Run | Load (1 min) | lint | typecheck | Serial total | Concurrent wall |
| --- | --- | --- | --- | --- | --- |
| 1 | 19.11 / 13.69 | 13.9 s | 6.9 s | 20.8 s | 13.7 s |
| 2 | 12.36 / 10.70 | 13.8 s | 6.3 s | 20.0 s | 12.9 s |

Running both at once saves about 7 s, roughly the whole typecheck, against a
10% bar of about 0.7 s. `review:full` now overlaps them, buffering each
step's output and printing it as one block when the step ends.

## `review:full`

Cold typecheck, `JOURNEY_TEST_WORKERS=2`:

| Run | Load (1 min) | Wall | lint | typecheck | test |
| --- | --- | --- | --- | --- | --- |
| before 1 | 20.07 | 57 s | 15.0 s | 7.0 s | 34.0 s |
| before 2 | 5.03 | 50 s | 12.8 s | 6.2 s | 30.1 s |
| after 1 | 7.13 | 34 s | 13.7 s (concurrent) | 7.6 s (concurrent) | 19.6 s |
| after 2 | 4.83 | 35 s | 13.9 s (concurrent) | 7.5 s (concurrent) | 20.7 s |

`before 2` and `after 2` ran back to back: 50 s becomes 35 s (30%).

## Proposed test-file allowances, Phases 3–7

Today: 206 test files (14 below the cap) and 50 `jsdom` files (30 below).
Phase 3 adds about one `node` engine test file per bead, and later phases
retire the legacy battle and tutorial-sandbox tests. Each phase gate checks
its ceiling. A bead that would cross it merges into an existing file, or
cuts a test file elsewhere in the same commit.

| Phase | Net test files | File ceiling at gate | `jsdom` ceiling | Basis |
| --- | --- | --- | --- | --- |
| 3 Engine | +6 | 212 | 50 | About 12 beads at one file per engine module or rules area; small modules share a file. No `jsdom`. |
| 4 Battle UI | 0 | 212 | 55 | Deletes the two non-tutorial legacy battle test files (`src/battle/integration/create-battle-init.test.ts`, `src/rules/battle/battle-events.test.ts`) and adds at most two battle-screen smokes. |
| 5 Content | +4 | 216 | 55 | One scenario-spec file per content batch, never per card. |
| 6 Tutorial | −8 | 208 | 52 | Deletes the six tutorial-sandbox files under `src/battle/` and `src/rules/battle/` (D38) and ports their contracts into existing journey-tutorial files. |
| 7 AI | +4 | 212 | 52 | One file per policy or planner module, in `node`. |

These ceilings sit below the D19 caps of 220 and 80, so each phase keeps
headroom for its gate's repairs. Suite wall at each gate stays at most 60 s.
