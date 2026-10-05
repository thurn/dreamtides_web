# hv-7x4l.3 measurements: prompt protocol re-run cost

Measured with `npm run fuzz:engine -- --games 1000` (every 10th game replayed
through the fold, suspending at every prompt), 2026-10-05, host load 15.4
(1-minute), Apple M-series laptop shared with other agents.

| Metric | Value |
| --- | --- |
| Games / steps | 1,000 / 541,035 |
| Prompts answered inline | 5,286 |
| Interactive re-runs (one per answer) | 488 |
| Mean fold re-run per answer | 0.065 ms |
| Target (engine-design § Performance targets) | < 2 ms for the largest step |
| Throughput, including invariants, inline replay, and interactive replay | 7.5 games/s |
| Failures (invariants, replay hash, interactive equivalence) | 0 |

The re-run cost includes cloning the committed state, replaying the step to
its next prompt, and the dev event-prefix check.
