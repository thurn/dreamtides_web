# hv-umm2.526: whole-game fuzz cost of observed-status snapshots

Base: staging `e1bda2dc1`. Every fuzz of 200 games and every `perf:ab` run
held the heavy slot (`lockf -k artifacts/heavy.lock`). CPU time is quoted
first; `load` is the 1-minute load average. The host was shared with other
sessions throughout (load 5 to 21).

## Profile

`node --cpu-prof --import tsx scripts/fuzz-engine.ts --games 20`, no heavy
slot, attributed innermost first (a sample inside `rememberKnownCards`
counts there, not in the invariant check that reached it):

| | `3874aca91` | `9e304b086` (hv-umm2.436) | `e1bda2dc1` (base) | this change |
| --- | --- | --- | --- | --- |
| steps | 10,480 | 10,480 | 9,270 | 9,270 |
| sampled | 8.93 s | 12.85 s | 10.89 s | 9.01 s |
| `invariantViolations` (redaction, round trip, layers) | 3.65 s | 4.44 s | 3.83 s | 3.70 s |
| `rememberKnownCards` | — | 2.32 s | 1.87 s | 0.80 s |
| engine stepping and other fuzz work | 1.71 s | 2.03 s | 1.67 s | 1.66 s |
| `replayFinalHash` and interactive replay | 1.37 s | 1.61 s | 1.43 s | 1.34 s |
| `determinizationDivergences` | 0.62 s | 0.74 s | 0.63 s | 0.66 s |

- hv-umm2.436 added about 3.9 s on the same 10,480 steps. Of that,
  `rememberKnownCards` took 2.3 s. It runs before every emitted event and
  prompt and before each knowledge change, about four times per step. Each
  call compared every card each side identifies (about 51 records per
  state) as two `JSON.stringify` texts.
- The rest is state size. Each record repeats a card's printing, variant,
  status and fixed effects, so every clone, serialization and hash carries
  more data. Measured on 114 mid-game fuzz states:

  | Per state | base | without `rememberedCards` |
  | --- | --- | --- |
  | `cloneState` | 18.2 µs | 6.5 µs |
  | invariant round trip (`serializeState`, `deserializeState`, two `stateHash`) | 220.5 µs | 125.6 µs |
  | `rememberKnownCards` with nothing to record | 48.8 µs (base), 14.1 µs (this change) | |

- Determinization fidelity, view `observedFixedEffect` lookups and
  loop/cycle signatures each cost under 1% of the run.

## Change

`rememberKnownCards` (view/knowledge.ts) still writes exactly the records it
wrote before. It replaces a record exactly when
`JSON.stringify(previous) !== JSON.stringify(observation)`, key order
included:

- One pass over `state.floating` groups each card's fixed permanent effects,
  instead of a filter of every floating effect for every card and viewer.
- `sameJson` decides that text equality without building either text: the
  same keys in the same order, with values JSON omits skipped, non-finite
  numbers as `null`, and array holes as `null`.
- `sameObservation` compares a record field by field when the record, its
  printing, its variant and its status have their usual fields in their usual
  order. Otherwise it falls back to `sameJson`, and it builds no observation
  object unless a record changes.

Clone, hash, invariant and determinization-fidelity code is unchanged.
A new test in `hidden-card-status.test.ts` checks the comparison contract.
That test passes against the base too. It covers an omitted `undefined` key
(the record is kept), a reordered status (the record is rewritten) and a
changed value (the record is rewritten).

## Interleaved A/B

`npm run perf:ab -- e1bda2dc1 --workload fuzz` (50 games, 23,801 steps
per run), A the base and B this change:

| Run | A CPU median (range) | B CPU median (range) | A / B load median | B vs A CPU | B vs A wall |
| --- | --- | --- | --- | --- | --- |
| final code, 7 rounds | 28.78 s (25.75–29.14) | 25.32 s (23.32–28.85) | 11.92 / 13.35 | **−12.0%** | −13.6% |
| final code, 5 rounds | 27.41 s (26.91–29.27) | 25.33 s (23.28–25.83) | 11.31 / 11.60 | −7.6% | −10.7% |
| first cut (`sameJson` only), 5 rounds | 26.59 s (26.12–28.21) | 23.91 s (23.42–25.12) | 4.99 / 5.29 | −10.1% | −12.0% |
| first cut, `--args "--games 200" --rounds 3` | 105.80 s | 102.82 s | 15.11 / 12.47 | −2.8% | −3.4% |

- The final code measured 1.209 → 1.064 ms CPU per step in the 7-round run.
- In every run, CPU exceeds wall by about 4 s per process. That is GC and
  compiler threads, and they hardly change. So the wall-clock change runs
  ahead of the CPU change.
- The 200-game run is the outlier. Load swung from 5 to 17 between rounds,
  and B ran at load 12.5 in round 1 against A at 5.2. Its rounds disagree
  with the standalone runs below by up to 11% at similar load.

## Seeded 200-game fuzz

`npm run fuzz:engine -- --games 200`. The summary is unchanged:

| Tree | Steps | Prompts | Results | Failures | CPU (wall) | Load at start | CPU per step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| base `e1bda2dc1` | 99,404 | 2,617 | player 104, enemy 95, draw 1 | 0 | 105.2 s (96.1 s) | 9.8 | 1.058 ms |
| this change, first cut | 99,404 | 2,617 | player 104, enemy 95, draw 1 | 0 | 89.9 s (81.6 s) | 7.1 | 0.904 ms |
| this change, final | 99,404 | 2,617 | player 104, enemy 95, draw 1 | 0 | 85.7 s (77.7 s) | 13.7 | 0.862 ms |
| this change, final (repeat) | 99,404 | 2,617 | player 104, enemy 95, draw 1 | 0 | 95.1 s (86.1 s) | 17.9 | 0.957 ms |

Seeds `fuzz-0` to `fuzz-39`, played with `playFuzzGame` in both trees, give
the same final state hash, event digest, step count, result and failure
for every game. The 40-line listings are byte-identical.

## Against the 60 s budget

The release smoke (`--games 200`) runs 78–86 s wall and 86–95 s CPU here,
against 96 s wall and 105 s CPU on the base. **It still misses the 60 s
budget.** The remaining excess is the size of the observed-status state.
The per-step invariant check serializes, parses and hashes the whole state,
and with these records that costs about 95 µs more per step, roughly 10% of
a step. Cloning adds about 12 µs per clone. Both are needed to verify and
preserve the saved observed records, and this change narrows neither check.
The 60 s budget assumed the 0.60 ms per step measured before hv-umm2.436;
hv-umm2.46 will revise it.
