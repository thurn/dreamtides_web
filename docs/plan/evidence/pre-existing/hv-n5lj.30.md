# Pre-existing issues found by hv-n5lj.30

At staging `43a89b09e` (before this bead's change, and unchanged by it):

- **The engine AI's policy worker times out in development battles.** In the
  seed-1 Greedy battle on a `scripts/dev.mjs` server, most of the enemy's
  non-forced decisions log `ai.error` with reason `timeout` (round trips of
  2.5 to 3.6 s against the D23 budget plus `workerGraceMs`) and are answered
  by the fallback policy. Whether and when the worker starts answering varies
  from run to run in the same checkout (one base game answered 8 decisions
  from the worker, another none), so dev-server QA of the seed-1 battle sees
  the enemy make different plays between runs. A production build
  (`--prod`) shows the same AI turns in base and after runs. Logs:
  `logs/journey-log.jsonl`, events `ai.decision` (`source`) and `ai.error`.
