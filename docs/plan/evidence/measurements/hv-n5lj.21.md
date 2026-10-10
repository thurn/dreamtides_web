# hv-n5lj.21 measurements (long main-thread tasks during AI turns, production build)

Base `6761a8219`. Captures and raw results are in the primary checkout's
gitignored `artifacts/qa/hv-n5lj.21/`. Every browser number comes from a
`vite build` served by `vite preview` through the QA runner
(`node scripts/qa/run-scenario.mjs <scenario> --bead hv-n5lj.21 --prod
--arg turns=5`), unminified unless marked `--minify`. The base ran from a
detached snapshot outside the repository (`--cwd`), interleaved with this
bead's checkout.

## Scenarios

- `prod-longtasks.mjs`: hv-n5lj.6's scenario, unchanged. The smoke walk to
  Battle Start of the seed-1 journey, then six AI turns of the battle under a
  `longtask` PerformanceObserver. A task counts as an AI-turn task when it
  starts between the far side's turn start and the near side's.
- `prod-trace.mjs`: the same walk under a Chrome trace (`Tracing` domain over
  a CDP session: `toplevel`, `devtools.timeline`, and the V8 CPU profiler's
  `ProfileChunk` samples). It attributes each main-thread `RunTask` of 40 ms
  or more: timeline events and inclusive and self time per function.
- `prod-fit.mjs` and `prod-perf.mjs` read marks from temporary instrumented
  builds (text-fit runs, and render, layout-effect, passive-effect, and fit
  timings). The instrumentation is not in the commit.
- `prod-big.mjs` records the DOM state after a task of over 100 ms.

The Profiler domain alone sampled at about 50 Hz in the MCP's Chromium and
could not be aligned with the observer's clock, so attribution uses traces.

## Before and after

`prod-longtasks.mjs`, interleaved A/B rounds. Each run passes through six
AI turns. The tasks are split into JavaScript tasks (at most 100 ms) and
compositor tasks (over 100 ms; see below).

| Run | Host load | AI-turn long tasks (ms) |
| --- | --- | --- |
| Base 1 | 3.26 | 63, 64, 67, 75, 82, 50, 88 |
| This bead 1 | 4.29 | 55, 60, **151**, 51, 57, 60 |
| Base 2 | 2.96 | 58, 61, **145**, 69, 74, **159**, 88, **212**, 68 |
| This bead 2 | 3.37 | 52, 58, **195**, 50, 59, **146**, 67 |
| Base 3 | 3.50 | 56, 67, 62, 77, **152**, 55, 96, 77, 51, 85 |
| This bead 3 | 3.44 | 50, 54, 58, 59, 64 |
| Base `--minify` | 3.49 | 62, 64, 60, 72, 79, 50, 82, 53 |
| This bead `--minify` | 3.69 | 52, 52, 51, 59, 67, 71 |

Over the three unminified rounds:

| | JavaScript long tasks | Median | Max | Sum | Compositor tasks |
| --- | --- | --- | --- | --- | --- |
| Base | 22 | 67.5 ms | 96 ms | 1533 ms | 4 (145–212 ms) |
| This bead | 15 | 58 ms | 67 ms | 854 ms | 3 (146–195 ms) |

Two single probes (`probe-*`, loads 3.46 and 3.16) and hv-n5lj.6's
base run agree: base 7 JavaScript tasks (51–84 ms) and one 171 ms compositor
task; this bead 5 (56–80 ms) and one 156 ms compositor task.

In the traces, the sampled main-thread time inside AI-turn long tasks fell
from 1535 ms (14 tasks, `trace-before2`, load 3.17) to 1145 ms (8 tasks,
`trace-after1`, load 2.32).

## Remaining long tasks, attributed

Every remaining JavaScript long task is the frame that presents an AI card
play. `prod-fit.mjs` saw exactly one card mount in each: the opponent's
card at reading size (`BattlePlayReveal`). `prod-perf.mjs` split seven of
them (load 3.22):

| Task | Fold and publish | Battle screen render and commit (first text fit) | After the commit (later text fits) |
| --- | --- | --- | --- |
| 51 ms | 12 ms | 19 ms (5.5) | 21 ms (11.3) |
| 50 ms | 13 ms | 20 ms (3.9) | 17 ms (5.9) |
| 54 ms | 11 ms | 24 ms (4.0) | 19 ms (6.3) |
| 57 ms | 10 ms | 22 ms (5.5) | 25 ms (10.9) |
| 68 ms | 14 ms | 27 ms (8.4) | 27 ms (12.0) |
| 56 ms | 11 ms | 18 ms (3.2) | 28 ms (6.7) |
| 62 ms | 12 ms | 24 ms (5.3) | 26 ms (10.7) |

- **Fold and publish (10–14 ms):** the AI's deferred submission
  (`TimerFire`), the log append and fold (`reduceEngineIntent`, about 4 ms),
  the presentation feed, and the log records (`logEvent`, about 5 ms per task
  in the trace; see the pre-existing issues).
- **Render and commit (18–27 ms):** `EngineBattleScreen` and the whole
  `MobileBattleScreen` tree re-render. Building the screen model is 0.2 ms;
  the engine views are memo hits.
- **After the commit (17–28 ms):** the revealed `GameCard`'s measure
  cascade. `useCardMetrics` (`src/cumulus/components/card/CardView.tsx`)
  measures the card's width in a passive effect, so the card first renders
  and fits its text (`useFitText`) at the default width, then re-renders at
  its measured width and fits again; the stat orbs fit too. Each fit is a
  binary search over forced layouts (`fits`, `getBoundingClientRect`):
  6–12 ms of fitting plus the re-render and framer-motion's layout
  measurements.

Taking the cascade out (a `CardView` change, outside this bead's areas)
would leave about 30–40 ms per reveal frame.

**Compositor tasks (145–215 ms)** occur in both builds, at most once or
twice per run, mostly about 6 s into an AI turn. The trace shows no
JavaScript in them: `Commit` (193 ms) or `PrePaint` (154 ms) on the main
thread, all `(program)`. They are Blink's rendering pipeline, not engine or
React work; `prod-big.mjs` did not reproduce one in a three-turn run.

## What changed in the attribution

The base's long tasks chained two intents: the AI driver answered a forced
decision inside the passive effect of the render that presented the
previous one, so a single task folded, rendered, and text-fitted twice
(`update` → `answered` → `submit` → `battleAction`, 9–20 ms per task in
`trace-before`). The driver now submits in a task of its own. The engine
views the hv-n5lj.6 note named are small: in `trace-before2`, `view` is not
among the 160 costliest functions over six AI turns, whose cutoff is 13 ms
in total. The view memo removes the second and third build of each.

## Engine performance

`npm run perf:ab -- 6761a8219 --workload fuzz,bench --rounds 3`:

| Workload | A CPU median | B CPU median | Change | Loads A / B |
| --- | --- | --- | --- | --- |
| fuzz (`--games 50`) | 11.44 s | 11.43 s | −0.1% CPU, −0.0% wall | 3.02 / 2.78 |
| bench | 4.96 s | 4.96 s | −0.1% CPU, −0.5% wall | 3.48 / 3.44 |

## Fuzz

`npm run fuzz:engine -- --games 200`, identical summaries:

| Build | Wall | Load | Summary |
| --- | --- | --- | --- |
| Base | 36.6 s | 3.11 | 102219 steps; prompts 1533; re-runs 134; player 102, enemy 98, draw 0; failures 0 |
| This bead | 37.3 s | 2.80 | 102219 steps; prompts 1533; re-runs 134; player 102, enemy 98, draw 0; failures 0 |

## Validation

| Check | Wall time | Host load | Result |
| --- | --- | --- | --- |
| Focused tests (driver, view, view model) | 2 s | 3.1 | pass |
| `npm run review:full` (engine hub change) | 45 s | 3.14 | 213 files, 2432 tests pass |
| `npm run review` | 17 s | 2.73 | pass |
| `prod-longtasks.mjs --prod`, 3 + 3 runs and 1 + 1 `--minify` | 94–101 s each | 2.96–4.29 | PASS, `__caps` empty |
