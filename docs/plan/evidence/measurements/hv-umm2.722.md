# hv-umm2.722 verification

Dispatch: `2026-10-15T06:37:05.497Z`. Evidence cutoff: `2026-10-15T06:55:23.785215Z`. The implementation window includes research, coordination, all validation and packaging; its final cutoff is refreshed immediately before the automatic-date commit. Actual Git completion is recorded externally, with at most 60 seconds of tail.

| Check | Result | Outer wall seconds |
| --- | --- | ---: |
| Owning contracts v02 | 15 passed | 10.052 |
| Owning and affected opening/privacy/log/fold v03 | 7 files, 5,827 passed | 25.971 |
| Required review v01 | static checks and 312 files, 9,628 passed | 69.047 |
| Required Knip v01 | passed | 5.549 |
| Single locked full v01 | 393 files, 10,637 passed; production bundle passed | 118.956 |

The full envelope was 119.369 seconds. Lock command entry and command start have distinct timestamps in the structured evidence. Their difference includes startup and is not isolated lock wait. The full suite used two workers under the D17 lock; Vitest measured 77.51 seconds at observed shared-host load (test stage start 7.4375, bundle start 9.4345703125). The observed 77.51-second Vitest duration and 78.2-second native test phase exceed the D19 under-60-second target: this run did not meet that target. No controlled low-load qualification or comparison is claimed.

The final owning suite has 254 lines. It obtains original physical IDs through public prepared initialization, then exercises actual engine and fold paths for both sides. Prospective saved begin-step DTOs pin strict current/history-base guards; genuine opening redraw prompts pin suspension, cold replay, cancellation refusal, retained committed hands after a failed published suffix, and later ordinary card lifecycle. Synthetic hand counts are declared from the public prepared config, independently of catalog defaults.

All validation source maps were frozen. The initial typecheck created only the canonical ignored/untracked token materialization, and its original false freeze plus exact delta remain in the raw proof. Its two local compiler errors were corrected. The first focused run's two failing rollback assertions were corrected to respect the existing contract that published private draws remain known after rollback. The final test-only prepared-fixture adjustment after review is covered by Knip and the final full epoch. Full schema and content coverage checks passed; own final friction/schema evidence is checked separately after packaging.

Immutable resource proof: `implementation-20261015T063728823Z/implementation-resource-audit-v01.json`, SHA-256 `b12923bc9623d5e409e8bcec4b2a094103992f53000af96c51c7edf1ed5118c0`, under this bead's primary ignored QA archive. The structured measurement links the complete path, exact commands, raw outputs, wall/CPU/load samples, source epochs and process-group cleanup. Every validation and full-suite synthetic server fixture group was absent at the final process audit. No feature browser/server/provider/fuzz run or image was launched.

Fresh cold core review and certified delivery belong to the parent session. Original journey and authored-content acceptance remains with hv-umm2.269.

Dispatch correction (hv-umm2.726): the exact native implementation call is call_1067beb160e74ed0820e22848e9e7ed2 at 2026-10-15T06:37:05.497Z. The original receipt selected a later extraction call at 2026-10-15T06:37:28.823Z through substring matching and understated elapsed time by 23.326 seconds. The corrected cutoff interval is 18.304803583 minutes; original cutoff, automatic Git end, 0.425421-second tail, source-qualified checks and immutable raw receipts retain their recorded values. The source-linked correction proof is in this measurement JSON.
