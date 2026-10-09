# hv-7x4l.49 measurements: base-vs-head engine performance

Measured 2026-10-09 with `npm run perf:ab` (`scripts/perf-ab.ts`) on the
shared Apple M-series host (18 cores). Each run checks the base out as a
detached snapshot under the OS temporary directory, shares this checkout's
`node_modules` (identical `package-lock.json`), runs one untimed 1-game
warm-up per tree, then alternates timed rounds A (base) and B (this
checkout). CPU time is user plus system time of the whole round process,
module loading and TypeScript transforms included, from its own
`process.resourceUsage()`. Load is the 1-minute average as each round
starts. Spread is (max − min) / median.

## Head vs head: the noise floor

Command: `npm run perf:ab -- HEAD --rounds 5` on this bead's commit, so A and
B run identical code (fuzz workload, `--games 50`).

| Side | Wall median (range, spread) | CPU median (range, spread) | Load median |
| --- | --- | --- | --- |
| A `HEAD` snapshot | 10.27 s (10.17–10.48, 3.0%) | 11.97 s (11.82–12.03, 1.8%) | 3.66 |
| B this checkout | 10.22 s (10.16–10.48, 3.2%) | 11.90 s (11.82–12.07, 2.0%) | 3.55 |

B vs A: wall −0.5%, CPU −0.6%. At load 3–4, a median difference within about
±2% is noise; CPU time spreads less than wall time.

## Event-redaction invariant cost

The event-redaction fuzz invariant (`EventRedaction`,
`src/engine/testing/redaction.ts`, added by `ec53af159`) raised the
release-stage `fuzz` step from about 38 s to 48.8 s. Base `17fd0bece` is the
commit before it.

Command: `npm run perf:ab -- 17fd0bece --rounds 5` (fuzz workload,
`--games 50`: 25,625 steps per round, 0 failures on both sides).

| Run | Side | Wall median (range, spread) | CPU median (range, spread) | Load median | B vs A |
| --- | --- | --- | --- | --- | --- |
| Before the optimization | A `17fd0bece` | 10.08 s (10.03–10.35, 3.2%) | 11.77 s (11.69–11.97, 2.3%) | 3.23 | |
| | B `ec53af159` | 12.43 s (12.32–12.54, 1.8%) | 14.17 s (14.06–14.39, 2.3%) | 3.59 | wall +23.3%, CPU +20.4% |
| After the optimization | A `17fd0bece` | 10.34 s (10.13–10.50, 3.6%) | 11.96 s (11.81–12.02, 1.7%) | 3.67 | |
| | B this bead | 10.36 s (10.06–10.73, 6.5%) | 12.07 s (11.78–12.39, 5.0%) | 3.74 | wall +0.2%, CPU +0.9% |

The ranges do not overlap before the optimization, and overlap fully after
it: the invariant's cost is within the round-to-round noise, inside the
~10% target.

`npm run fuzz:engine -- --games 200` after the optimization: 101,385 steps,
37.8 s wall, 41.2 s CPU (5.3 games/s wall, 4.9 games/s CPU), 0 failures,
load 3.01 → 2.94. Before it, the same command took about 48 s locally.

### What cost the time

A CPU profile of 30 fuzz games (`node --import tsx --cpu-prof
scripts/fuzz-engine.ts --games 30`) at `ec53af159`:

- `EventRedaction.check` was 18.1% of the run, and 15.3% was
  `cardIdFromUnknown`: every string of every visible event that is not an
  instance ID (event kinds, field names, sides, zones) went through
  `parseCardId`, which throws, and the thrown `Error` captured a stack trace
  each time.
- Every string also got a field path (`sources[0]`, `purpose.cardId`) built
  eagerly, though paths only serve a failure message.

### The optimization

- A string is tested as a card ID with `isCardId` (the UUID pattern) before
  `parseCardId`, so nothing throws.
- A path-free walk (`anyString`) first asks whether any string of the event
  as the side sees it names a hidden card; the path-building walk
  (`namedStrings`) runs only for an event that leaks, to report it.

The check still runs on every event after every step and on every suspended
step's events in the interactive replay, with the same rule. After the
change `check` is 0.8% of the profiled run.

### Detection power

- `src/engine/view/view.test.ts` (synthetic instance-ID and card-ID leaks)
  and the `src/engine/triggers/triggers.test.ts` negative tests pass.
- Making `triggerQueued` skip its redaction fails 8 tests across the two
  files, so the tests still fail when that protection is reverted.
- Making `cardDrawn` public: `fuzz:engine --games 10` fails all 10 games
  with the optimized invariant and with the `ec53af159` invariant, with
  identical failure messages (the same events, field paths, and instance
  IDs).
