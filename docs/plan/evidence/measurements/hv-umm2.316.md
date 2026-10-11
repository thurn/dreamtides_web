# hv-umm2.316: Phase 5 fuzz cost per step

Base: staging `f736ea7f0`. Every run below held the heavy slot
(`lockf -k artifacts/heavy.lock`). CPU time is quoted first; the host
was shared with other sessions throughout (1-minute load 4 to 24).

## Bisect

`npm run perf:ab -- <oid> --workload fuzz --rounds 3` (50 games), with
A the listed commit and B the base `f736ea7f0` in every run. That makes
B a common yardstick: the last column is A's CPU per step over B's, measured
in the same interleaved run. CPU includes each process's ~1.5 s module load.

| A | A steps | A CPU median (spread) | B CPU median (spread) | A load / B load | A per step ÷ B per step |
| --- | --- | --- | --- | --- | --- |
| `0ce8c42c4` (before hv-1mj7) | 25,831 | 14.97 s (22.2%) | 15.62 s (17.7%) | 13.6 / 12.6 | 0.93 |
| `e868d12c7` hv-1mj7 fuzz workload | 26,042 | 16.48 s (11.2%) | 15.57 s (10.0%) | 14.6 / 18.6 | 1.02 |
| `d80126ea5` hv-umm2.53 statics outside play | 25,533 | 15.41 s (4.3%) | 13.72 s (4.2%) | 23.3 / 21.2 | 1.10 |
| `42ead1cbf` hv-umm2.305 determinization | 25,723 | 15.57 s (10.0%) | 13.77 s (15.9%) | 13.3 / 11.4 | 1.10 |
| `c181147a5` zone card references | 26,521 | 16.47 s (15.9%) | 14.32 s (8.2%) | 6.5 / 6.3 | 1.09 |
| `59bbefc5d` hv-umm2.321 authored emblems | 25,062 | 14.79 s (4.3%) | 15.05 s (10.4%) | 5.7 / 5.6 | 0.98 |
| `f736ea7f0` (B itself) | 25,062 | | | | 1.00 |

- **hv-1mj7** (`e868d12c7`, emblems, Dreamwell and figments in fuzz
  battles) added about 10% per step. That is a workload change.
- **hv-umm2.53** (`d80126ea5`, statics gathered from every hand, deck and
  void card) added about 8% per step. Every layer evaluation read the
  abilities of every card outside play, though no card in the fuzz catalog
  has a static ability working there.
- **hv-umm2.305** (determinization) and **hv-umm2.307** (announced-change
  invariant) do not show at this resolution. Random-policy fuzz never
  determinizes.
- **`c181147a5` → `59bbefc5d`** (six commits, ending with hv-umm2.321's
  return toward authored emblems) took about 10% back, mostly by changing the
  workload: the step count went from 26,521 to 25,062.
- **hv-umm2.322** (`9972827a6`, the shared `worksInZone` predicate) is
  within noise: +1.7%.
- **Net:** the base costs about 7.5% more CPU per step than `0ce8c42c4` at
  equal load, not 27%.
- The release step's 40.6 s → 54–62 s also reflects host load. The Phase 5
  smoke runs that measured 48–53 s CPU (hv-umm2.321, hv-umm2.322) ran at
  load 29.6–29.9. The Phase 4 figures were taken at load 4.5–4.9.

## Profile of the base

`node --cpu-prof --cpu-prof-interval 500 --import tsx scripts/fuzz-engine.ts --games 100`,
51,394 steps, 28.3 s sampled, load ~15:

| Share | Where |
| --- | --- |
| 55.8% | `invariantViolations` after every step (fuzz harness) |
| 17.2% | its redaction check; `strings` alone 9.4%: every string of both views put into a `Set` |
| ~22% | its serialization round trip: `JSON.parse` 10.3%, `JSON.stringify` 4.9%, two `stateHash` |
| 5.4% | its fresh layer evaluation of every card, plus a `JSON.stringify` comparison per card |
| 16.7% | `legalMoves` (feasibility search) |
| 13.0% | `replayFinalHash` |
| 10.3% | `Layers` construction: `collectStatics` 9.7%, about 7% of it the scan of cards outside play |

## Change

- **`EngineCatalog.staticsOutsidePlay()`** (catalog.ts) reports whether any
  card's base or amplified variant, or any figment, has a static ability that
  works from a zone other than play, by the shared `worksInZone`. It is read
  on first use and kept.
  - While it is false, `collectStatics` (layers.ts) and determinization's
    `reconcile` (determinize.ts) read the abilities only of cards outside play
    that have transfigurations or deck mods (`plainVariant` false), the
    variants the flag does not cover.
  - It is false for the fuzz and production catalogs: 0 of 696 fuzz cards.
  - `collectStatics` also orders only the cards that have static abilities.
- **Redaction invariant** (testing/redaction.ts): `leaks` walks the view
  looking for the hidden IDs instead of building a `Set` of all its
  strings, and `viewViolations` builds its hidden set once per viewer
  instead of once per zone.
- **Memo invariant** (testing/invariants.ts): memoized and fresh
  characteristics are compared field by field. The field list is checked
  against `Characteristics` at compile time. Before, each was serialized with
  `JSON.stringify`.
- None of this changes rules, outcomes or checks. The tests in
  continuous.test.ts check the flag against a direct scan of synthetic
  catalogs. They also check that a deck-mod-only void static applies in a
  catalog whose flag is false; that test fails when the fallback is removed.

## Result

`npm run perf:ab -- f736ea7f0 --workload fuzz --rounds 5` (50 games),
A = base, B = change:

| Round | A CPU | B CPU | A load | B load |
| --- | --- | --- | --- | --- |
| 1 | 13.76 s | 12.19 s | 20.3 | 24.1 |
| 2 | 13.53 s | 11.56 s | 24.6 | 23.0 |
| 3 | 13.19 s | 11.73 s | 21.6 | 19.2 |
| 4 | 13.08 s | 11.35 s | 16.8 | 15.2 |
| 5 | 12.96 s | 11.47 s | 13.3 | 11.6 |

- **CPU:** A median 13.19 s (12.96–13.76, spread 6.0%), B median 11.56 s
  (11.35–12.19, spread 7.3%). **B vs A: −12.4%.** Each round is 11–15%
  lower.
- **Wall:** 11.49 s → 9.87 s, −14.1%. Load median 20.3 / 19.2.
- **Fuzz summaries:** all ten summaries are identical: 25,062 steps,
  prompts 440, 41 interactive re-runs, results 22/28/0, no feasibility
  bounds, 0 failures.
- **200 games** (`--rounds 1 --args "--games 200"`): CPU 45.26 s → 39.41 s
  (−12.9%), wall 41.78 s → 35.89 s, load 9.4 / 6.0. Both summaries are
  100,710 steps, prompts 1688, 166 re-runs, results 90/110/0, 0 failures.
- **Engine bench** (`--workload bench --rounds 3`, no invariants): CPU
  4.88 s → 4.46 s (−8.5%, spreads 1.1% / 0.8%, load 4.7). Per step, 69 µs →
  59 µs. This is the layer-evaluation part of the change.
- **Final smoke** (`npm run fuzz:engine -- --games 200`): 38.1 s CPU, 34.6 s
  wall, load 6.1. 100,710 steps, prompts 1688, 166 re-runs, results
  90/110/0, 0 failures.

## Remaining costs

- **The serialization round-trip invariant** is about 22% of fuzz CPU. A
  cheaper check would test something different, so it is unchanged.
- **Feasibility-search work states** build a fresh layer evaluation on each
  read, because uncommitted states are not memoized.
