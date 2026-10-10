# hv-n5lj.44 measurements (QA runner gaps)

Base `e21c8e116`. Captures, reports (`<name>.result.json`), and the
bead-local demonstration scenarios (`runner-gaps.mjs`, `long-call.mjs`,
`long-walk.mjs`, `tutorial-walk.mjs`, `trace-debug.mjs`) are in the primary
checkout's gitignored `artifacts/qa/hv-n5lj.44/`. Every run is the dev
server on port 5174 or higher, through the Playwright MCP service, at host
load 2.2–6.3.

## Gaps and demonstrations

| Gap (beads) | API | Demonstration | Result |
| --- | --- | --- | --- |
| `page.goto` rejects relative routes (.20) | `qa.goto(route, { allowErrors?, waitUntil? })`, `qa.url(route)`; `qa.open` builds on `goto` | `runner-gaps.mjs` step 0: `qa.goto("?goto=dreamscape&seed=1")` and `qa.url("main?seed=1")` | `http://localhost:5176/?goto=dreamscape&seed=1` loaded with origin and `__caps` asserted; `.../main?seed=1` resolved. `battle-result` reloads its game with `qa.goto(page.url())` |
| No `qa.captureDir`, no clipped or element capture (.22) | `qa.captureDir`; `qa.capture(name, { clip?, element?, pad?, fullPage? })`, the clip cut to the viewport and recorded in the report | `runner-gaps.mjs` step 0 | `gaps-clip.png` 300×200 (clip 300×200); `gaps-clip-edge.png` 120×120 (a 400×160 clip overhanging the top-right corner, cut to the viewport); `gaps-element.png` 73×73 (a 60×60 site node, `pad: 6`); `captureDir` returned as `/Users/dthurn/dreamtides_web/artifacts/qa/hv-n5lj.44` |
| A walk longer than one MCP call never returns (.8) | an array default export (steps, `qa.step`, `qa.carry`), `export const viewports` or `--viewports` (`qa.viewportName`, `qa.viewport`); a per-call limit | see below | see below |
| No trace helper (.21) | `qa.trace(name, fn, { longTaskMs?, top? })` | `runner-gaps.mjs` step 1 traces a 120 ms busy loop between two 500 ms idle stretches; `ai-reveal --arg trace=1` | see below |

### Long walks

The cause is one MCP call's lifetime, not the walk: a single
`browser_run_code_unsafe` call that sleeps (`long-call.mjs`, no browser
work) returns at 280 s and never returns at 320 s.

| Run | Runner | Calls | Wall time | Outcome |
| --- | --- | --- | --- | --- |
| `long-call --arg seconds=280` | this bead | 1 | 281 s | PASS (with the runner's 240 s warning) |
| `long-call --arg seconds=320 --timeout 480` | base | 1 | 480 s | `McpError -32001: Request timed out` at `--timeout`, exit 2 |
| `long-call --arg seconds=320 --timeout 480` | this bead | 1 | 315 s | FAIL at the 300 s limit + 15 s, naming the lost response and the fix (split into steps), exit 1 |
| `long-walk` (2 steps × desktop, mobile, 100 s each of passing turns in `?goto=battle-playable`) | this bead | 4 (105, 101, 104, 101 s) | 411.5 s | PASS; step 1 continued step 0's game (`game=` id carried), each pass at its viewport, `__caps` empty |

The likely mechanism is Node fetch's 300 s body timeout in the MCP SDK
client; the runner does not depend on it, only on the measured limit.

`tutorial-walk.mjs`, the hv-n5lj.8 tutorial walk changed only to walk
`qa.viewportName` under `export const viewports`, ran as one call per
viewport but failed at its first beat in 52 s: the walk looks for a `Begin`
button the current main menu does not have (it offers New Journey). The
bead-local walk is stale against the current front door, not a runner
failure; `long-walk` stands in for it.

### Trace

`qa.trace` starts CDP `Tracing` (`toplevel`, `devtools.timeline` with its
disabled-by-default timeline, `blink.user_timing`, `v8.execute`, and the V8
sampling profiler), brackets `fn` with `performance.mark`s, and summarizes
the renderer main thread (the marks' thread) between them:

- **Clock sync.** The busy loop recorded `performance.now()` 5494.4 ms at
  its start; the trace placed its task at 5494.1 ms, 120.5 ms long, with
  sampled JavaScript `busyLoop` 104.8 ms and `now` 14.4 ms (54 tasks in a
  1130 ms window).
- **AI reveal.** `ai-reveal --arg trace=1` (desktop, load 4.0): 139.8 ms
  from the start mark to the reveal, one long task, 83.1 ms at 3453.3 ms:
  self time `FunctionCall` 63.9, `Layout` 9.3, `V8.HandleInterrupts` 4.0;
  sampled JavaScript `jsxDEV` 21.6, `run` 13.0, `get offsetWidth` 5.8,
  `jsx` 5.0, `MotionDOMComponent` 4.5, `trackLoops`
  (`src/engine/loops/tracker.ts:63`) 3.8 ms. A rerun on the final code
  found the same single long task, 90.1 ms at 3455.2 ms. The dev build's JSX
  runtime and layout reads (`offsetWidth`) dominate, as hv-n5lj.21 found.
- **Profiler start-up.** Starting the sampling profiler costs one task of
  about 440 ms on the next script the page runs, which is the start mark's.
  The summary counts only tasks that begin at or after the start mark, so
  that task is excluded.
- The battle screen is busy under tracing: about 1,500 main-thread tasks in
  the 140 ms reveal window, mostly IPC (`Receive mojo message`), and about
  238,000 events in a trace of a 1 s idle wait (`trace-debug.mjs`). The
  summary reads them in single passes.

## Scenarios

Each run: `node scripts/qa/run-scenario.mjs <scenario> --bead hv-n5lj.44`.

| Scenario | Viewport | Runs | Wall time (scenario) | Result |
| --- | --- | --- | --- | --- |
| `battle-result` (victory) | desktop | 3 | 9.6, 9.7, 9.1 s | 3 PASS: `[data-battle-result-surface=victory]` full-viewport, Continue enabled after the count-up, again after the reload; `scoreToWin` 10; `__caps` empty |
| `battle-result --arg outcome=defeat` | desktop | 1 | 8.7 s | PASS: `[data-battle-result-surface=defeat]` and its action panel, again after the reload |
| `battle-result` (victory, defeat) | mobile | 1 each | 8.9, 8.4 s | PASS, 390×844 |
| `ai-reveal` | desktop | 3 | 9.0, 8.9, 8.9 s | 3 PASS: the AI revealed a card from its hand on its first turn (no human pass needed), grown to the reveal's 240×336 at (600, 282), then the card travelled; `__caps` empty |
| `ai-reveal` | mobile | 1 | 9.0 s | PASS: 175.5×245.7 at (107, 299) |
| `ai-reveal --arg trace=1` | desktop | 1 | 6.8 s | PASS, trace above |

Captures: `battle-result-{victory,defeat}-{desktop,mobile}.png` and their
`-content.png` element captures; `ai-reveal-{desktop,mobile}.png` and
`-card.png`.

Earlier `ai-reveal` runs captured the card mid-growth (its box held still
across two 50 ms polls while frames were sparse); the scenario now waits
until the card's width reaches the reveal's.

## Other checks

- `npm run review`: 9.0 s at load 3.5, pass (lint, import cycles, both
  typechecks; no related tests). `npx knip`: clean.

- `card-sweep --cards a526fa7b-5cef-4da9-a3f2-27ee0bd9b481 --variants base`
  through the changed prelude: `pending` as before (the ledger line was a
  check, not kept).
- One `long-walk` run made while a second runner served the same checkout
  failed its first load (`Game hooks must be used within a LocalGameProvider`
  on `?goto=battle-playable`); the same scenario passed when run alone. The
  runs above are sequential.
