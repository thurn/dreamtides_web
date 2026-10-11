# hv-umm2.305 measurements (determinization cost with hidden-zone statics)

Base staging `5225f5581` (A) against this change (B), each run under
`lockf -k artifacts/heavy.lock` on the same host, 1-minute load 9 to 22.

## Production catalog (no card has a static ability working from a hand or deck)

`npx tsx scripts/bench-engine.ts --games 1 --step-games 20 --interactive-games 0`,
determinization of a view every 10th state of 20 Random games, n = 2064,
three interleaved rounds:

| Round | A median | B median | A p99 | B p99 |
| --- | --- | --- | --- | --- |
| 1 | 130.2 µs | 145.9 µs | 288.6 µs | 231.3 µs |
| 2 | 126.0 µs | 140.8 µs | 215.3 µs | 254.2 µs |
| 3 | 123.2 µs | 133.7 µs | 209.9 µs | 211.9 µs |

- B adds about 10 to 15 µs a determinization: one ability-list read per
  distinct hidden card to find that none has such an ability, after which
  the deal is returned unchanged with no layer evaluation.
- A first version keyed that read by `JSON.stringify` of printing and
  variant and cost about 20 µs; the plain-variant key brought it down.

## Synthetic hidden-static board (scratch script, not committed)

The enemy has 3 characters in play, a 5-card hand, and a 22-card deck
holding a "+1✦ while in your hand" anthem and a "characters the opponent
plays cost 1● more while in your hand" tax; the player views. 2000
determinizations each, one run per tree:

| Case | A median | B median | B p90 |
| --- | --- | --- | --- |
| Neither source in the hand (deal already consistent) | 40.8 µs | 58.6 µs | 114.5 µs |
| Both sources in the hand (reconciled by swaps) | 39.4 µs | 86.2 µs | 115.1 µs |
| Decklist short one anthem the view needs (no consistent deal; closest kept) | 39.9 µs | 87.7 µs | 100.9 µs |

- A reconciled determinization costs one layer evaluation of the view's
  cards per tried move; these boards needed a few, so the cost stays well
  under 0.1 ms against Greedy's 2 determinizations per decision and its
  500 to 1500 ms budgets.
- The bound is structural: each accepted move lowers an integer distance,
  and a round tries at most, per hidden source, (1 + distinct swap
  partners) x (1 + 2 x the keyword and base-spark changes) moves.
