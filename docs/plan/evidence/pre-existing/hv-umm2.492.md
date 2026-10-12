# Pre-existing observations for hv-umm2.492

A full-suite `review:gate` step stays open for about 42 to 65 seconds after its last check reports `finished`. The cause is the transfer of the test-gate's buffered output to Tollgate.

- `scripts/review.mjs` buffers each concurrent check's output and writes it after the check exits. The full-suite test-gate is about 4.1 MB, written in one `process.stdout.write`.
- Tollgate's log consumer reads that pipe at about 64 to 97 KiB/s in 8192-byte frames, so the write takes about a minute. For the observed live gate `01a12e5f-b495-7232-a0d9-2bee35c882cb`, `node scripts/review.mjs gate` stayed alive for about 58 s after test-gate finished. It used 0.01 s of CPU in that time and was sleeping in every sample, which means it was blocked on pipe backpressure.
- The native step ended 0.049 s after the last frame. All 8 retained full-suite gate logs show the same pattern: one 509-frame burst at the end, and the step ends 0.02 to 0.11 s after the last frame.
- No vitest, tsc or eslint descendant outlived its check. Gates that run focused tests have no burst and finish in 12 to 17 s.
- About 97% of the burst (4.0 MB) is single-line JSON that the `src/logging.ts` console transport prints during passing tests. The largest sources are `src/runtime/qa-scenes.test.ts` (2.4 MB), `src/runtime/qa-scenes-battle.test.ts` (1.0 MB) and `src/runtime/qa-scenes-atlas.test.ts` (0.3 MB).

A separate repair bead is warranted. Its likely files are `src/logging.ts` and `vitest.config.ts`: keep log transport output from passing tests out of test stdout. An alternative is `scripts/review.mjs`: in gate mode, do not replay buffered output for passing checks.

Read-only evidence cannot explain why the Tollgate consumer path is so slow. It is not CPU bound: the worker stays at about 4% CPU, and frame gaps cluster near multiples of about 24 ms. This is a Tollgate observation, not a defect that blocks the run. No speed improvement is claimed.
