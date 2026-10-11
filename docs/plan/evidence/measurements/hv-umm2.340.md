# hv-umm2.340 measurements

Base: `cd3cb64f1`. Worktree: `probe-attributed-events`. Browser runs use
the scenario runner (`node scripts/qa/run-scenario.mjs`), port 5174, its
own MCP client and browser lease. Load is `sysctl -n vm.loadavg`'s 1-minute
value at the run's start, as the runner reports it.

## Scenario runs

Lease wait, serve, and scenario execution are the runner's separate
`wallMs` fields, in seconds; calls are each viewport's execution.

| Run | Code | Load | Lease wait | Serve | Execution | Calls |
| --- | --- | --- | --- | --- | --- | --- |
| `card-lab-play` (`card=f160fd01-…`, `as=player`) | base | 26.99 | 0.043 | 2.768 | 12.287 | desktop 12.287 |
| `card-lab-play` (same) | change | 7.58 | 0.043 | 0.948 | 6.237 | desktop 6.236 |
| `card-lab-stage` (`stage=hand:player:5e5e…0002`) | base | 21.47 | 0.046 | 1.857 | 10.237 | desktop 6.384, mobile 3.852 |
| `card-lab-stage` (same) | change | 7.47 | 0.044 | 0.946 | 9.249 | desktop 5.466, mobile 3.783 |
| `card-lab-stage` (`declared=1`, `card=0e1209c3-…`) | change | 11.45 | 0.047 | 1.255 | 58.459 | desktop 26.793, mobile 31.666 |
| `engine-events` (new) | change | 15.29 | 0.042 | 1.253 | 36.513 | desktop 19.138, mobile 17.375 |

- The base and change runs differ in host load (27 and 21 against 7.5), so
  they are not at comparable load. **This bead makes no speed claim.** The
  change adds no wait, poll, or step to the existing consumers; the rows
  show they stay compatible (all pass with empty `__caps`).
- `engine-events` is the representative setup and observation: a declared
  lab (setup), two UI plays, five `waitForEvents` matches, two quiet reads,
  three captures, and one AI turn to the enemy's draw. Each event wait is a
  `qa.battle.waitForEvents` note in the report. The plays' `playUntil` runs
  took 0.6 s and 1.6–1.7 s; the pass to the enemy's draw (three phase
  presses and the AI's Dawn) took 10.4 s of each viewport's call.
- Base reports: `card-lab-play-before.result.json`,
  `card-lab-stage-before.result.json`; change reports:
  `card-lab-play-after.result.json`, `card-lab-stage-after.result.json`,
  `card-lab-stage-declared-after.result.json`, `engine-events.result.json`,
  all in `artifacts/qa/hv-umm2.340/`.

## Attribution observed

`engine-events` on both viewports, battle
`battle:unscoped:site-5::0::dreamscape-1`, events keyed `[seq, index]`:

- `effectStarted` of the source `i1` (printing `f160fd01-…`), controller
  `player`: `[2, 3]`.
- Floating `triggerQueued`, source `i1`, controller `player`, node 0,
  subject `i2` (the character): `[3, 4]`; its `triggerResolved`, applied:
  `[3, 5]`.
- The player's `cardDrawn` of `i3`, the deck's top before the play
  (printing `5e5e5e5e-0000-4000-8000-000000000002`): `[3, 6]`; exactly one
  draw after the character's cursor.
- Two reads at the settled main phase: no events, the same cursor
  `[3, 6]`.
- The enemy's `cardDrawn` of `i11`, its deck's top before the pass: `[6, 7]`.

## Validation

| Check | Heavy wait s | Execution s | Load | Result |
| --- | --- | --- | --- | --- |
| `npm test -- scripts/qa/prelude.test.mjs` | — | 0.11 | — | 15 tests pass |
| `npm test -- src/battle/components/battle-presentation.test.tsx` | — | 1.64 | — | 6 tests pass |
| `npm run review` | — | 16.54 | 18.17 | pass (first run 20.40) |
| `npm run knip` | — | 2.55 | — | pass |
| `npm run review:full` (heavy slot) | 0 | 50.31 | 13.41 | pass: 216 test files, production bundle check holds no development-only module |
