# Dream Merchant v3 — metric tuning log (Task 19)

This log records each tuning round of the metrics harness
(`scripts/merchant-experiment.ts`, `npm run merchant-metric`). Each round picks
the worst failing metric, maps it to its lever in `src/journey_v2/tuning.ts`
(or, where a metric is mis-specified, fixes the harness/spec target), re-runs at
defaults (60 records × 40 seeds × 4 buckets = 9600 encounters), and records the
movement.

The harness drives the real generator; the only varied randomness is the
quest-seed string. Numbers below are at defaults unless a smaller
`--records/--seeds` sweep is noted for in-flight iteration.

## Baseline — 2026-06-09, commit `6c56b80b`

| Metric family | Result | Notes |
|---|---|---|
| distinct_outcomes | PASS | pick-0 = 2387 distinct, pick-5 = 2372 (target ≥ 50) |
| desirability | FAIL | see per-archetype below |
| repetition | PASS | mean P(identical pair) = 0.000% (target < 2%) |
| archetype_coverage | FAIL | nearly every eligible archetype ratio ≈ 2.2–2.6× |
| content_coverage | FAIL | transfig=FAIL (Rose 0%), dreamsign=FAIL (51.3%), cards=PASS (97.1%) |

Desirability per archetype (target: median ≥ 75, floor ≥ 50):

| archetype | samples | median | floor | result |
|---|---|---|---|---|
| card_bundle | 1026 | 93.9 | 74.5 | PASS |
| category_draft_known | 1243 | 93.2 | 37.1 | FAIL |
| dreamsign | 1526 | 56.5 | 48.1 | FAIL |
| dreamsign_draft | 1164 | 87.7 | 48.1 | FAIL |
| fit_card_draft | 1316 | 95.8 | 77.0 | PASS |
| fit_card_grant | 1282 | 87.1 | 74.5 | PASS |
| premium_draft | 796 | 98.4 | 91.4 | PASS |
| purge | 1551 | 9.1 | 0.0 | FAIL |
| purge_replace | 1487 | 9.1 | 0.0 | FAIL |
| strong_card | 1014 | 91.9 | 84.9 | PASS |
| transfigure | 1846 | 85.0 | 57.1 | PASS |
| transfigured_draft | 832 | 96.0 | 80.6 | PASS |
| tribal_change | 320 | 70.0 | 0.0 | FAIL |

Content coverage detail:
- Transfiguration shares: Viridian 13.92, Scarlet 13.50, Golden 3.90, Azure 2.35,
  Bronze 2.28, Magenta 1.02, **Rose 0.00**, Prismatic 63.03.
- Dreamsign templates offered: 79/154 = 51.3% (target 100%).
- Non-starter pool cards offered: 494/509 = 97.1% (target ≥ 90%) — PASS.

Structural facts discovered while reading the baseline (drive several rounds
below):
- **Multiplicity is structurally near-zero in the corpus.** Of 501 corpus cards,
  only 6 have any multiplicity, max 0.0457; **zero** cards reach 0.10 or 0.15.
  The adapted draft records are singleton mainboards, so
  `m(c) = mainboardsWith2+ / mainboardsWith1+` is essentially always 0.
  `copies_draft` (needs m ≥ 0.15) and `duplicate` (needs m ≥ 0.10) therefore can
  never be eligible. This is a corpus property, not a tuning bug.
- **Rose transfiguration is structurally unreachable.** Exactly one card in the
  519-card pool (`Vortex Claimant`) even matches the Rose eligibility regex, and
  it matches only by mentioning "activated abilities" in flavor — no pool card
  has an activated ability the Rose effect can discount. "All 8 types appear" is
  therefore physically unattainable.

## Round 1 — purge/purge_replace desirability metric bug (harness fix)

**Lever:** `scripts/merchant-experiment.ts` (harness metric definition; no
tuning change). Two coupled fixes, both metric-definition bugs:

1. `percentileOf` was strict-less-than, so a value tied with the top of its
   population scored ~0. Made it tie-aware mid-rank
   (`(below + 0.5·ties)/n`); continuous-signal archetypes are unaffected.
2. Purge desirability scored the target against the **pre-filtered purge
   candidate band** (circular — uniform sampling within the worst band can never
   clear a median ≥ 75 target). The spec defines it as "the target's misfit
   percentile (worst fit = high desirability)". Rewrote it to score against the
   **whole deck's** misfit population (`deckMisfitScores`) using a dedicated
   `misfitPercentile` (`(atOrBelow)/n`): a starter or worst-fit card tied at the
   maximum misfit reads ~100 — it is the weakest card in the deck and the ideal
   purge.

**Movement (defaults):**

| archetype | before (median/floor) | after | result |
|---|---|---|---|
| purge | 9.1 / 0.0 FAIL | 100.0 / 100.0 | PASS |
| purge_replace | 9.1 / 0.0 FAIL | 100.0 / 100.0 | PASS |

Remaining desirability fails: `category_draft_known` (floor 37.2),
`dreamsign` (median 73.7), `tribal_change` (floor 21.4). `npm test` green
(2750 passed).

## Round 2 — archetype coverage expected-share metric bug (harness fix)

**Lever:** `scripts/merchant-experiment.ts` (harness metric definition; no
tuning change). The expected ("weight-implied") share modelled **slot A only**
(`weight / Σ eligible weight`) but the observed share counts **both** offer
slots, and slot B is a weighted draw constrained to a *different family* than
slot A. Ignoring slot B and the family-distinctness rule systematically halved
the expected share of small-family archetypes, producing a spurious ~2.2–2.6×
ratio for almost every archetype even though the generator was behaving
correctly.

Replaced the expected model with `twoSlotExpectedSlots`, the exact two-slot
draw with the family constraint:
`E[slots_i] = P(A=i) + Σ_a P(A=a)·P(B=i | A=a)`, summing to 2 per encounter.

**Movement (defaults):** every eligible archetype moved from ratio ≈ 2.2–2.6
(FAIL) to **0.96–1.07 (PASS)**. Metric 4 result FAIL → **PASS**. Confirms the
two-stage lottery distributes archetypes as designed. `npm test` green.

**Running total: 3/5 (distinct_outcomes, repetition, archetype_coverage).**
