# hv-umm2.772 verification

The exact immutable game-173 request at committed hash `11298d1280cd6c` selects a finite `repeatLoop` count of 32 under the original normal 256/64 budgets. Its real application returns a nonwinning committed state at `02827673826467` after 32 loop steps. The next real policy decision passes from Day to Dusk, reaching `15ce5bfc39ed91`.

The own public witness verifies all 5,251 original hash-chain lines, rebuilds the full-catalog create plus 49 committed actions, and checks every one of the 257 original public steps and all returned hashes, events, answers and feasibility boundaries. The public tournament request recipe reproduces request80 SHA256 `df41f8775cff52b1c920f4ea636ee8781553f0d5b1efe164c3fdcf2f718dafb4` exactly. Every observed step passes invariants, event redaction and announced-change checks; prompt redaction and decision-boundary determinization fidelity also pass. Recorded-answer replay of create plus all 51 actions matches every returned boundary and final hash.

Synthetic regressions execute real finite actions for both actors, including useful victory across multiple batches, default and cap1 saturation before an adverse window boundary, equal public views under hidden allocation and seed changes, and failed or unfinished simulations. Existing productive-activation, 771 movement-horizon and Phasing contracts pass.

| Check | Result | Wall seconds | CPU seconds |
| --- | --- | ---: | ---: |
| Focused policy, final source | 94 passed | 11.246 | 15.641 |
| Review, final source | 7,289 tests in 45 files; lint, both typechecks and import cycles pass | 41.971 | 119.551 |
| Knip | Pass | 8.654 | 6.445 |
| Causal prefix | Exact prefix and request80 SHA | 3.645 | 3.924 |
| Causal progress and replay | Finite commit, original-window exit, complete replay | 33.880 | 36.292 |

Two early negatives are retained in the companion JSON: a privacy fixture changed hidden identities after recording a loop, and test TypeScript used computed-key casts/readonly assignments. Both are repaired in the final tested source. These are implementation-local test mistakes, not pre-existing project issues.

The companion JSON records the eight listed validation/witness commands with UTC/monotonic/CPU/load/exit/process-group receipts, immutable source-epoch hashes and artifact paths. Evidence-schema and Git receipts remain in outside-commit custody to avoid self-referential hashes. All eight process groups settled; no browser, server, port or long-lived runtime process remains. The implementation helper returns after the Git receipt. No configuration value, normal budget, rules, engine, fuzzer or checker changed. These durations demonstrate bounded command completion; they make no engine performance claim. The causal witness establishes finite action completion and original-window progress, and supplies no complete-battle or acceptance-game credit.

The assignment clock starts at native claim `2026-10-16T19:33:19Z`. Exact initial helper dispatch is unobserved and is not inferred. Final pre-Git evidence cutoff is `2026-10-16T19:55:04.088811+00:00` (21.751 minutes from claim). Schema verification, artifact indexing and Git execution after that cutoff are measured in the additive outside-commit tail receipt. The actual Git return and full claim-to-Git interval are recorded additively outside the commit after execution, with no clock-only amend.

The cold review's P3 finding applies D19's same-commit test-file size rule. The new loop helpers and both-actor cases reside in `greedy-loop.contracts.ts`, registered once from `policy.test.ts`. The moved body is byte-identical; imports and an identical local typed slice helper complete the extraction. Final file lengths are 410 and 221 lines respectively (baseline policy test: 481); the test-file delta is +1 file and +150 lines, with no added jsdom file.

The final extraction epoch passes focused policy (94 tests, 11.318 s), review (7,289 tests in 45 files, lint, both typechecks, import cycles and friction schema, 42.215 s), and Knip (4.162 s). All three process groups settled. The companion JSON retains the original eight validation/witness commands and appends these three commands with exact source bindings.

The causal witness, original artifact index and original actual-Git receipt retain their v01 source epoch. Production policy and catalog-comment bytes match the final extracted epoch exactly; the changed test layout is qualified separately and requires no causal rerun. The final v02 claim-inclusive pre-Git cutoff is `2026-10-16T20:03:21.896292+00:00` (30.048 minutes), including cold review and repair. Final schema and actual amend-return/cutoff-tail receipts are additive outside the commit; the original evidence and receipts remain retained.
