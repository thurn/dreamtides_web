# hv-n5lj.53 measurements (shared battle driver `qa.battle`)

Dev runs on port 5175 from the bead's worktree, one runner at a time; `before`
is the unmodified worktree at `1b6516e5a`. Scenario time is the runner's
`wallMs.scenario`; load is the 1-minute `vm.loadavg` when the run started.
Reports are `artifacts/qa/hv-n5lj.53/{before,after}-<scenario>*.result.json`.

## Line counts

| File | Before | After |
| --- | --- | --- |
| `scripts/qa/scenarios/smoke.mjs` | 100 | 25 |
| `scripts/qa/scenarios/ai-reveal.mjs` | 96 | 82 |
| `scripts/qa/scenarios/battle-result.mjs` | 106 | 87 |
| `scripts/qa/scenarios/card-lab-play.mjs` | 271 | 178 |
| `scripts/qa/scenarios/tutorial-walk.mjs` | 420 | 409 |
| Five tracked scenarios | 993 | 781 |
| `scripts/qa/prelude.mjs` | 736 | 1299 |

The tracked scenarios hold no pass loop or phase polling of their own:
`smoke`, `ai-reveal`, `card-lab-play`, and `tutorial-walk`'s live battle play
through `qa.battle.playUntil`, `battle-result` waits on the probe through
`qa.battle.waitFor`, and `smoke`'s front-door walk is
`qa.battle.enterFirstBattle`.

## Scenario wall times (desktop unless noted)

| Scenario | Before s (load) | After runs 1 / 2 / 3, s (load) |
| --- | --- | --- |
| `smoke` | 36.0 (15.7) | 35.0 (6.3) / 36.1 (5.6) / 40.1 (20.3) |
| `smoke --prod` | 30.4 (4.8) | 29.6 (18.3) |
| `ai-reveal` | 6.4 (10.3) | 6.6 (7.1) / 5.7 (6.0) / 6.0 (15.1) |
| `battle-result` | 11.0 (8.9) | 10.7 (7.5) / 8.1 (5.7) / 10.4 (12.6) |
| `card-lab-play` (`2162742c…`, base) | 6.3 (7.9) | 6.6 (6.8) / 5.5 (6.3) / 5.9 (11.3) |
| `tutorial-walk` | 181 (7.3) | 183 (7.3) / 205 (6.0) / 206 (10.0) |

Mobile, once each: `smoke` 68.1 s (21.2), `ai-reveal` 5.9 s (18.8),
`battle-result` 9.3 s (17.0), `card-lab-play` 5.9 s (14.6), `tutorial-walk`
201 s (11.9). Every run passed with no `__caps` entry.

- The `tutorial-walk` spread is in its live-battle step (83 s, 101 s, 104 s
  against 83 s before), and as much of it lies in the unchanged scripted part
  of that step (41 s, 50 s, 46 s) as in the driven part (42 s, 51 s, 58 s);
  every run made the same three presses and recorded the same enemy-turn
  beats. Run 1 matches the baseline, so the spread is host load and the AI
  host's pace, not the driver.
- The other scenarios are within load noise of the baseline.

## playUntil on the seed-1 battle

`artifacts/qa/hv-n5lj.53/battle-four-turns.mjs` walks the front door with
`qa.battle.enterFirstBattle` and plays until four turns have passed and the
player has passed a respond window in the enemy's turn.

| Mode | Turns | Passes | Responds | Driven ms | History |
| --- | --- | --- | --- | --- | --- |
| `debug=1` (probe) | 4 | 10 | 1 (`far:day`, stack 1) | 40 853 | near:day > near:night > far:day > far:dusk > near:day > near:night > far:day > far:dusk > near:day |
| Screen only | 4 | 10 | 3 (every far-turn pass) | 41 329 | the same |

Neither run stalled. Without the probe, `window` calls every pass in the far
side's turn `respond`; the probe shows only the `far:day` one is the
engine's respond decision.

## Prompt surfaces

`artifacts/qa/hv-n5lj.53/prompt-answers.mjs` plays each opening-hand card of
the prompt-lab fixtures `targets`, `choices`, `up-to-one-target`, `arrange`,
`foresee`, and `void-cost` with `debug=1` and lets `playUntil` answer: it met
and answered `chooseTargets` on the `target` and `board` surfaces,
`chooseMode`, `confirm`, and `chooseTargets` on `choice`, `chooseNumber` on
`number`, `arrange` on `arrange` and `foresee`, and `chooseCards` on
`gallery`, in 41 s at load 6.7.

## Card sweep

`node scripts/qa/card-sweep.mjs --cards a526fa7b…,4408b942…,e83014d3…,647f5150…,2162742c… --variants base --as both`
swept 10 runs in 62 s at load 4.0: 8 `pending`, 2 `pass`, the same verdicts
as `hv-n5lj.7`'s ledger for those cards and sides
(`docs/plan/evidence/qa-ledger/hv-n5lj.53.jsonl`).
