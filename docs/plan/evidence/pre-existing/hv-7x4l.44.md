# Pre-existing issues found by hv-7x4l.44

- `src/engine/steps/errors.ts` (`Feasible`, `EmptyPrompt`, `Infeasible`):
  the sentinels a feasibility dry run throws for control flow extend
  `Error` and capture a stack trace on every dry run; `Feasible`'s
  constructor alone is about 2% of fuzz CPU self time
  (`node --cpu-prof`, 60 games).
