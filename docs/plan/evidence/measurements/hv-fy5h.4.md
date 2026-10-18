# hv-fy5h.4 Expert strength measurements

The Expert (`src/engine/policy/expert.ts`) against live Greedy, which at
the time equals `greedy@7.2`. Scale:1 budgets, paired seats, the frozen
deck pool. Screens of 100 games carry a Wilson 95% interval of about ±10
points; 64–72% of pairs split by deck and seat, so only about a third of
pairs are decided by the policies.

| Run | Expert variant | Games | Expert win rate | Wilson 95% CI | Mean decision |
| --- | --- | ---: | ---: | --- | ---: |
| screen, seed hv-fy5h.4-screen | 1 determinization, Dusk 8 | 40 | 52.50% | 37.50–67.06% | 407 ms |
| screen2 | + support-aware lane pruning, 2 determinizations | 84 | 51.19% | 40.69–61.59% | 1006 ms |
| screen3 | + ability value, 1 determinization | 100 | 50.00% | 40.38–59.62% | 456 ms |
| screen4 (seed screen3) | Day projection without blocks | 100 | 47.00% | 37.51–56.71% | 87 ms |
| hybrid1 (seed screen3) | Greedy Day, Expert elsewhere | 100 | 50.50% | 40.87–60.13% | 84 ms |
| turns2 (seed screen3) | two-turn horizon | 100 | 47.00% | 37.51–56.71% | 652 ms |
| blend (seed screen3) | mean of immediate and realized value | 100 | 48.00% | 38.46–57.68% | 410 ms |
| eval-a (seed screen3) | hand 0.25, tempo 1.25 | 100 | 50.00% | 40.38–59.62% | 521 ms |
| eval-b (seed screen3) | score 20, race 80 | 100 | 48.00% | 38.46–57.68% | 533 ms |
| det3 (seed screen3) | 3 determinizations, Dusk 16 | 100 | 54.00% | 44.26–63.44% | 2347 ms |
| det4 (seed screen3) | 4 determinizations, projected Dusk 4 | 100 | 50.00% | 40.38–59.62% | 500 ms |
| [look2](../ai/hv-fy5h-4-look2.md), seed screen5 | two-action Day lookahead, 3 determinizations | 200 | 56.75% | 49.82–63.43% | 1354 ms |
| [expert-greedy](../ai/hv-fy5h-4-expert-greedy.md), seed acceptance | the same | 399 | 51.25% | 46.36–56.12% | 1571 ms |

The same Expert against `greedy@5` (40 games): 80.00%, Wilson 65.24–89.50%,
where Greedy scored 89.25% over 400 games.
