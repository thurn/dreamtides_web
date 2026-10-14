# hv-umm2.699 measurements

Original dispatch: 2026-10-14T23:15:27.950Z. Implementation window ends 2026-10-14T23:22:12+00:00; 6.734167 minutes, including read-only audit, admission, waits, mutation, validation, evidence packaging and Git. Commit uses Git's automatic committer timestamp; the ignored external bracket records subsecond precision.

| Check | Exit | Wall seconds | Starting host load |
| --- | --- | --- | --- |
| focused-new-01 | 0 | 10.891369 | { 10.02 12.34 13.33 } |
| mutant-reset-01 | 1 | 8.544722 | { 8.77 11.85 13.12 } |
| focused-restored-01 | 0 | 8.634595 | { 11.73 12.17 13.19 } |
| review-final-01 | 0 | 26.001170 | { 22.32 15.26 14.29 } |
| knip-final-01 | 0 | 5.409497 | { 24.63 16.74 14.87 } |
| schema-final-01 | 0 | 0.087530 | { 18.76 16.07 14.69 } |
| whitespace-final-01 | 0 | 0.021320 | { 18.76 16.07 14.69 } |

The existing 22 form cases cover both actors. Each reset loop scores7 through the public avatar effect before advancing, asserts the requested own turn ordinal (+2 ordinary, +1 extra), actor, Day, extra flag and main decision, then immediately reads score9. The isolated extra-turn played-history mutant fails both actors with expected9/received14. Exact runtime bytes are restored in finally after the child terminates; runtime diff and staged diff are empty.

All other contract bodies and tracked paths outside the five admitted paths match the initial source manifest. No new test cases, test entrypoints or jsdom files; contract module has 299 lines (net -1). Validation timings are observations at the recorded host load, without a speed or low-load budget claim. Full/browser/fuzz checks are unnecessary for this bounded contract/doc follow-up.

Raw command output, source manifests, exact mutation patch/backup/restoration and final commit bracket are retained under `receipts/helper/` in the bead's ignored QA directory. Fresh normal cold core review and Tollgate certification, promotion, cleanup and release-state observation belong to the parent. Existing RD-hv-umm2.697-1 semantics and original hv-umm2.192 full acceptance joins remain binding.
