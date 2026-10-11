# hv-umm2.366 boundary acceptance and measurements

Base: `533c26502a27f5ba1ca7a223c934de41b4e2728e`. This bead implements the
accepted state-boundary findings from hv-umm2.72, source
`5b56fc5cc42b5a52727b02c5323e5306f5361fb7`. The other-family report is retained
at `/tmp/dreamtides-review-01a128ef/review-hv-umm2.72.md`.

## Baseline detectors

The regression tests were authored and run before either production file was
edited. Root read the failure log and checked that both production diffs were
empty, then acknowledged the source-edit checkpoint. The targeted run exited 1:
8 failed, 3 passed, 29 skipped across two entrypoints.

- The public determinized trigger view omits the supplied snapshots 0, 1,
  1.5 and 3. Each failure shows the missing `scored` property.
- Real synthetic Challenge steps capture awards 1, 1.5 and 3. Resolving the
  authoritative queue emits actual `pointsScored` deltas -1, -1.5 and -3;
  the corresponding sampled resolutions omit those deltas.
- The public `validateLoadedState` lifecycle boundary accepts all ten tested
  malformed queue snapshots: `"not-a-number"`, `"3"`, -2, NaN, Infinity,
  -Infinity, null, an object, an array and true.
- An absent snapshot retains its optional-field shape, and absent/zero
  snapshots resolve to a neutral effect.

The original report's numeric-string NaN example is imprecise: `Math.max`
coerces `"3"`. A nonnumeric string can produce NaN, while a negative snapshot
can become a loss through `gainPoints(scoredAmount())`. The type boundary
rejects both string forms without depending on downstream coercion.

## Numeric and compatibility contract

The persisted snapshot is optional, finite and nonnegative. Positive
fractional values are legitimate: side scores and gained Spark accept finite
numbers, and effective Spark and Challenge awards preserve fractions. The
synthetic 1.5 award tests this path through a real Challenge step. The boundary
also accepts `Number.MAX_VALUE` as a finite nonnegative value.

Zero is an explicitly accepted neutral snapshot. The matcher enqueues only
positive scoring awards, but a loaded zero is well formed under the existing
number contract and resolves to zero. An absent snapshot is compatible with
older persisted queues. `isIndex` has a safe-integer contract for indices and
counts; scoring metadata uses the numeric contract, including fractions.

## Validation and scope

All local tests use `JOURNEY_TEST_WORKERS=2`. No test entrypoint is added;
the net test delta is +73 lines and +10 cases. The existing loaded-state case
receives 18 additional lines, keeping the boundary contract in its owning
entrypoint. `engine-battle.test.ts` is 543 lines (525 at base); retaining this
small coherent init/action/load/error boundary extension avoids another
test-file import and unrelated restructuring. `determinize.test.ts` is 386
lines.

| Check | Exit | Cases / files | Timing |
| --- | ---: | --- | --- |
| Targeted baseline | 1 | 8 failed, 3 passed, 29 skipped / 2 | 1.23 s Vitest; 3.3 s phase sum |
| Focused final | 0 | 323 / 4 | 2.23 s Vitest; 4.4 s phase sum |
| Quick review | 0 | 1,434 / 67 | 12.13 s Vitest; 31.7 s phase sum |
| Knip | 0 | unused-code check | 3.12 s whole command |
| Full review | 0 | 3,021 / 216 | 52.269 s execution; 52.289 s whole command |

Full review includes full lint, both type checks, import cycles, knip, the
complete suite and production bundle. It takes the D17 heavy slot through
`lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock`; measured queue
wait is 0.019 s and ending one-minute host load is 4.93. Light checks take no
heavy slot. The implementation interval in the friction record uses the fresh
worktree's first installation timestamp through final evidence preparation.

The exact synthetic queue-copy and loaded-state contracts exercise these two
boundaries directly. No rules algorithm or content ability changes, so an
additional 300-game fuzz run supplies no specific missing boundary coverage.
Browser QA is unnecessary for this internal copy/validation repair. Full-suite
browser-lease warning paths use synthetic temporary fixture roots; their
fixture servers report stopped with free ports.

Raw logs: `/tmp/dreamtides-hv-umm2.366/baseline.log`, `focused.log`,
`review.log`, `knip.log`, `full.log`; full command and queue timings are in
`/tmp/dreamtides-hv-umm2.366/full-timing.json`. The fresh install takes about
2 s; its dependency-audit observation is recorded in this bead's pre-existing
file.

## Tested source and writer closure

SHA-256 hashes of the final tested sources:

- `src/engine/view/determinize.ts`: `a827fefe756ef79303ae10175076ea1a44b7072552d44d4d702a0e91c4b4a006`
- `src/engine/view/determinize.test.ts`: `e26a29fc816318d94776682d2ec093652553251f268fa6fa57ef0dc3cbd10c75`
- `src/rules/battle/fold.ts`: `24b1445196c41582ef13e450f8e57aa1646a7796253e34a601c4a21ee066dad6`
- `src/rules/battle/engine-battle.test.ts`: `90903c3967d9e5b264eb1114a8cbd9606e6e6a3557b5da3fb76401bb97ddb9a9`

All install/test/check wrappers and the full-check heavy-lock child have
exited. The final process inventory contains no worktree or synthetic-lease
runtime beyond the inventory command itself. No task browser, server, watcher,
application/storage writer or provider handle was started. Root owns native
candidate submission, approval and promotion.
