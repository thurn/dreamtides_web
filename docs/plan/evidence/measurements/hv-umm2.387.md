# hv-umm2.387 — Review concurrency

## Frozen workload and protocol

Current source: `4f26b938aade21fb6ce95bdc498c588f1b5f1bb9`.
Both arms use this worktree's identical source, including the candidate runner
modules and tests. The frozen selection is the six executable/test paths in
engine/content source `004c3a106de60e1f58746f79114899f663ff7eb0` against
`5eb394869f188c3153f4ae38184dc9957d96af27`:

- `src/content/cards/passage-through-oblivion-967c714f.ts`
- `src/content/cards/starlight-guide-161482b6.ts`
- `src/engine/effects/primitives/contracts/rematerialize.contracts.ts`
- `src/engine/effects/primitives/index.ts`
- `src/engine/effects/primitives/rematerialize.ts`
- `src/engine/effects/registry.ts`

This is a simulated fixed engine/content path selection on the current tree.
It does not replay historical engine code or a native Tollgate build. Both
copied real runners receive that same path list; only local import URLs,
selection input, and identical start-load/finish-exit instrumentation are
rewritten. The baseline uses the frozen serial plan; the candidate groups its
independent static checks, selected lint, and tests after preparation.
The actual related selector finds 255 files and runs the whole suite:
322 files, 3,273 cases, passing in every arm.

Predeclared three pairs: A/B, B/A, A/B. Each pair is comparable only when
both start-load and mean-load differences are at most
`max(2.0, 20% of the lower load)`. Load is the one-minute `os.loadavg()[0]`,
sampled at start, end, and each second. Acceptance requires at least two
comparable successful pairs and a median of paired
`100 * (A wall - B wall) / A wall` of at least 10%.
One replacement pair was permitted for incomparable load. All three pairs
qualified, so six runs completed with no replacements.

One shared heavy-lock lease encloses all six runs. Queue: 0.041 s, excluded
from the metric. Two test workers throughout. Every arm deletes only its own
review build-info/declarations and Vitest/Vite caches. Gate reads and writes
no common shared typecheck state. OS page caches stay warm; interleaved order
balances their effect. A manifest freezes 2,105 source/config/test files;
hashes match before and after every arm and the initial full validation.
A later test-only synchronization refinement is covered below; executable
runner bytes match that frozen manifest through delivery.

## Results and disposition

CPU includes each runner's child processes, measured by `/usr/bin/time -l`
and child resource accounting. Wall includes prepare, checks/tests, and
local-asset restoration; unchanged dependency installation and lock queue
are excluded.

| Pair | Order | A serial wall s | B concurrent wall s | Paired improvement | A/B CPU s | A/B start load | A/B mean load |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | A/B | 44.395 | 36.657 | 17.432% | 110.381 / 113.209 | 6.995 / 6.120 | 7.238 / 6.556 |
| 2 | B/A | 43.367 | 36.150 | 16.641% | 109.185 / 113.230 | 5.308 / 6.453 | 5.296 / 6.104 |
| 3 | A/B | 44.811 | 47.689 | -6.423% | 112.375 / 137.864 | 4.927 / 5.516 | 5.456 / 6.587 |

**Retain:** predeclared paired median improvement is
**16.640767%**, meeting the 10% bar.
All pairs remain in the result. Pair 3 is a counterexample: concurrent wall
is 6.423% slower and CPU reaches 137.864 s despite comparable sampled load.
One-minute load cannot isolate short-lived contention. These runs support
the bounded measured improvement, with no universal speedup claim.

Serial/concurrent median walls are 44.395/36.657 s; median CPU is
110.381/113.230 s. The paired acceptance statistic is 16.640767%;
the percentage calculated from the two marginal medians is a different
statistic. The retrospective's native gate-stage median includes dependencies
and different integrated trees, so these measurements do not update that
native median or revise its budget.

Root independently verified paths, transformations, hashes, exits, cleanup,
and acceptance arithmetic in `root-benchmark-verification.json`, then
acknowledged retaining concurrency.

## Contracts and final validation

Gate and quick plans prepare before the independent group. Quick supports
typed changes, test-only selections, documentation, and deleted typed sources.
Every step prints its real start timestamp and load immediately, including
buffered concurrent steps; completion reports duration and exact exit code.
Diagnostic blocks remain buffered. The execution contract waits for every
step to settle, preserves the first failing numeric exit code in plan order,
and surfaces a start exception after consumers have drained. Asset restoration
runs after that drain; a successful restore preserves the existing failure.

Deferred-promise synthetic tests assert start-all, failure draining, cleanup
ordering, and exact first failing code without time thresholds. A faithful
`Promise.all` early-rejection mutant retains the same error wrapper/cause.
The original single-microtask assertion passed that mutant, so the contract
uses a Node event-loop-turn barrier while the surviving consumer remains
explicitly unresolved. The faithful mutant then fails specifically because
cleanup has already occurred. The actual `allSettled` helper passes, with exact
SHA `79615e6cd20c1683b67bf05a499b94c650d291bff14b01f619035c82f72f4982`
restored. Both mutation logs are retained. This refinement changes only the
execution test after the benchmark/full run; final focused/review/knip cover
the strengthened test, and every executable byte stays frozen.
Test delta: +1 node test file, +93 test lines, +6 cases, +0 jsdom files.
The plan test file is 399 lines; the execution test file is 59 lines.

| Check | Actual exit | Process wall s | Start / end load |
| --- | ---: | ---: | ---: |
| focused | 0 | 1.994 | 3.180 / 3.180 |
| review | 0 | 5.920 | 3.180 / 3.165 |
| knip | 0 | 2.295 | 2.759 / 2.759 |
| full | 0 | 64.261 | 4.789 / 5.756 |

Focused and diff-aware review pass 32 cases. Full review passes 3,273 cases
in 322 files plus whole-source lint, both typechecks, cycles, knip, and the
production bundle assertion. Its existing own incremental typecheck cache
is warm; this validation is separate from the cold benchmark. Full-review
heavy queue is 0.024 s, excluded from its process wall.
Full review's test step is 38.6 s and lint is 20.1 s. No timing assertion is
added to CI. The initial review caught two `require-await` fixture lint
errors; final fixtures and every subsequent check pass. Its failed raw log
is retained.

## Evidence and resources

Raw protocol, runner/plan copies, frozen candidate sources, six per-arm logs,
each-second load samples, CPU/time output, pair summary, final validation
logs, and cleanup proof remain in `/tmp/hv-umm2-387-checks/`.
The ignored benchmark harness was generated inside this owned worktree and
copied there for retention. No production benchmark option was added.

All 99 recorded groups are freshly absent, including benchmark controllers,
six arm groups, initial and final validation groups, and existing synthetic server
fixture groups. The heavy lease is released. Existing browser-lease contract
tests create only their temporary synthetic servers and close them.
No product browser/server, sweep, fuzz, reviewer, or external provider was
started for this bead.
