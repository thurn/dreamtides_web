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
