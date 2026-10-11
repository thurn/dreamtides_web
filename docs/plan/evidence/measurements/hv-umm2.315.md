# hv-umm2.315 verification evidence

Native claim: 2026-10-11T06:59:06Z. Dispatch note: 07:01:32Z (146 seconds after claim, including parent worktree setup and installation). Helper dispatch is approximately 07:01 UTC; the earliest recorded local clock observation is 07:01:49Z. Investigation, implementation, fixture repair, validation, queue time and evidence preparation all belong to the helper implementation interval. Final evidence freeze and final local commit terminate that interval; dispatch precision is approximately one minute.

All work used the assigned Tollgate worktree. No branch, update, candidate, approval, push or deploy action was taken by the helper.

| Check | Execution s | Slot queue s | Host load (1/5/15 min) | Result |
| --- | ---: | ---: | ---: | --- |
| focused | 3.422 | 0.021 | { 3.74 9.67 11.19 } | pass |
| review | 24.605 | 0.023 | { 3.84 9.59 11.15 } | fail (introduced fixture) |
| focused-final | 3.092 | 0.02 | { 3.70 8.21 10.48 } | pass |
| review-final | 18.473 | 0.021 | { 3.70 8.21 10.48 } | pass |
| knip | 2.716 | 0.02 | { 4.75 8.16 10.41 } | pass |
| full | 50.125 | 0.021 | { 4.93 8.14 10.39 } | pass |

Every check runs with `JOURNEY_TEST_WORKERS=2` under `lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock`. The focused final command covers the adapter, policy, tooling and QA-scene tests: 212 passed. Passing full validation: 216 test files, 2,836 tests, production bundle check, lint, typechecks, import cycles and knip. Timings measure execution after slot acquisition; queue time is separate. Initial baseline and first role-gap runs predate timing instrumentation; their wrapper test stages took 1.8 and 1.9 seconds respectively, with unmeasured queue intervals.

Initial role coverage exposed eight absent roles. Four synthetic fixtures plus traversal of each offered choice button cover all 22 roles. Target affordances use `isLegalAnswer` to preserve withheld one-card continuations; candidate visibility checks compare instance identities with actual board or gallery card models. No UI-string or production-content assertions were added. Test delta: zero files, +37 lines, zero jsdom files; 29 adapter cases remain.

Candidate-introduced failure: the first aggregate review failed `src/runtime/qa-scenes.test.ts:456` with `prompt-lab-offering-cost: expected false to be true`. Parking a cancellable Offering payment left a top-level committed decision. The final fixtures start at reloadable decisions; the existing Offering fixture is explored through each offered route instead. Raw first failure: `/tmp/hv-umm2.315-review.log`. This is distinct from expected negative failures.

Expected negative checks against the final traversal:

- `opponent-routing`: exit 1, 2.883 seconds. Exact source bytes restored, SHA-256 `c39e0fb5638432c640140b55227c941ac86da7383a631cde17fc55f2a70b921e`.
- `missing-fixture`: exit 1, 2.85 seconds. Exact source bytes restored, SHA-256 `2cd0ee3c6c452e65e530673c29bc74ffa6f076e1f028acc65cb9ebba23307c66`.
- `invalid-inventory`: exit 1, 0.672 seconds. Malformed input was not written.
- `invalid-bead`: exit 1, 0.614 seconds. Malformed input was not written.

Restoring opponent-hand board routing fails the new visibility assertion at adapter test line 790 (`discard-chosen: chooseCards: expected false to be true`) and two existing gallery assertions. Removing the `discard-chosen` fixture fails the exhaustive role assertion at line 765. Raw logs: `/tmp/hv-umm2.315-negative-final-opponent-routing.log` and `/tmp/hv-umm2.315-negative-final-missing-fixture.log`. Earlier expected negative logs are retained under `/tmp/hv-umm2.315-negative-*.log`.

Deleting Greedy's `optionalCost` strategy produces TS1360: property `optionalCost` is missing from the required `Record<PromptRole, ...>`, plus TS7053 at indexed strategy uses. The strategy file was restored byte-for-byte: SHA-256 `a62c136f6454f0559268265e880dcdf091eec1eb98d390070c604b2f781adf3f`. Check took 7.046 seconds, exit 2; raw log `/tmp/hv-umm2.315-negative-strategy.log`. A synthetic comparison with the base implementation agrees on 7,040 cases across all 22 roles, prompt kinds, allowed answer sets, optional-chain states, card values/ownership and Discover-cost opportunities; `/tmp/hv-umm2.315-policy-equivalence.log`.

Generator evidence: two `--refresh-prompt-areas` runs (0.639 and 0.603 seconds) and `--refresh-prompt-areas --check` (0.593 seconds) all yield SHA-256 `05b58336b518d89fca3ae59026f437c49baababe881f78b6700572481071f5c4`. Exact semantic comparison proves only areas/sharedAreas on beads 3, 5, 18, 34 and 44 changed, each receiving the five registration paths. Bead keys/order, entities/assignments/statuses, graph edges and all other fields match the captured inventory. Malformed inventory and bead inputs fail before writing. Generator preserves the current filed plan; default generation continues deriving future serialization edges from shared paths.

No routing gap or player workflow change was found. The prompt-host source remains unchanged. Browser QA and captures are unnecessary for these contract checks, synthetic fixtures, equivalent policy metadata and documentation. No dev server or browser context was started. Full test infrastructure creates synthetic QA runtimes in isolated temporary repositories and confirms their server groups stopped/ports free.

Failure and recovery boundaries: no engine state transition, persistence schema, privacy projection or rendering rule changes. Mid-step errors, reloads, partial game writes, stale/invalid answers and concurrent game actors use the existing fold/view contracts; focused tooling and QA-scene replay checks and the full suite pass. This bead adds compile-time registration failure, reachable-role coverage and public candidate-visibility checks. Generator invalid-input boundaries are exercised directly, with exact artifact restoration. No new rules decision, card issue, fallout path or runtime resource remains.

Passing full-source SHA-256 values (restoration verifies every value):
```json
{
  "src/screens/cumulus_adapters/engine-battle-view-model.test.ts": "3f4974be344a088d96b9a3ca5534110012a78df26b329c8acd508219851eeed2",
  "src/engine/testing/prompt-lab.ts": "2cd0ee3c6c452e65e530673c29bc74ffa6f076e1f028acc65cb9ebba23307c66",
  "src/engine/policy/prompts.ts": "a62c136f6454f0559268265e880dcdf091eec1eb98d390070c604b2f781adf3f",
  "src/screens/cumulus_adapters/prompt-host-view-model.ts": "c39e0fb5638432c640140b55227c941ac86da7383a631cde17fc55f2a70b921e",
  "scripts/content-inventory.ts": "413aca1e261646af6bfb544e45f4ed98f9ba68510a173fc215d686ff85b7ff57",
  "docs/plan/evidence/content-inventory.json": "05b58336b518d89fca3ae59026f437c49baababe881f78b6700572481071f5c4",
  "docs/plan/phase-5-content.md": "e5a7d96ff539951c4d57a1865f50e8d6202147bc93ed4c99278e03440eeb647e"
}
```

Final mandatory review and knip run with these evidence files present; final timing and interval data are appended at evidence freeze.

Final evidence freeze: 2026-10-11T07:13:54.068698+00:00. Approximate helper dispatch-to-local-commit interval: 12.9 minutes, including all investigation and the introduced fixture repair. The final commit immediately follows this freeze; its Git committer timestamp supplies the exact endpoint. Claim-to-commit includes the separate parent claim/setup interval beginning 06:59:06Z.

- `review-evidence`: pass, execution 21.129 seconds, queue 0.023 seconds, load { 3.01 6.02 9.13 }.
- `knip-evidence`: pass, execution 2.255 seconds, queue 0.025 seconds, load { 3.24 5.87 9.00 }.

Every runtime/test/generator/recipe source hash matches passing full validation after negative rollback. No writer, server, browser context or candidate remains owned by this helper. The local source commit is ready for parent-only candidate submission and promotion.
