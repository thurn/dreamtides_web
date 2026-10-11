# hv-umm2.415 measurements

Base: `3721853869f4265f66dd4174067efab7fd7adab0`. Implementation dispatch: `2026-10-11T19:11:42.510966+00:00`. Initial evidence preparation observation: `2026-10-11T19:19:50.215421+00:00` (8.128 elapsed minutes). Final commit preparation: `2026-10-11T19:23:30.951993+00:00`. Elapsed dispatch-to-final-preparation: **11.807 minutes**, including research, validation, every parent audit and acknowledgement wait, and this temporal evidence correction. The final endpoint is sampled immediately before writing and staging the two temporal evidence files and invoking the final amend. The actual amend command's start, elapsed seconds and terminal result are retained in the private runtime sidecar, which records its proximity to the endpoint. Each load below is the actual command-start sample from `sysctl -n vm.loadavg`; the friction scalar is the review-start 1-minute observation **3.7**.

## Validation and runtime ledger

| Command record | PID | Wall seconds | Exit | Start load (1/5/15 min) |
| --- | --- | --- | --- | --- |
| install | 97547 | 2.331 | 0 | { 23.89 23.14 19.12 } |
| generator-baseline | 1037 | 2.166 | 0 | { 11.04 19.44 18.04 } |
| generator-baseline-capture | 2534 | 0.623 | 0 | { 5.65 16.02 16.85 } |
| negative-semantics | 2438 | 3.075 | 1 | { 6.05 16.28 16.95 } |
| negative-corrected | 3013 | 2.966 | 1 | { 4.38 15.07 16.49 } |
| negative-final | 3500 | 2.878 | 1 | { 4.96 14.51 16.25 } |
| negative-confirmed | 3809 | 2.962 | 1 | { 5.03 14.06 16.06 } |
| friction-baseline | 4714 | 0.171 | 2 | { 4.45 12.78 15.50 } |
| focused-final | 5731 | 2.760 | 0 | { 4.32 11.73 14.99 } |
| generator-final | 5836 | 1.010 | 0 | { 4.32 11.73 14.99 } |
| generator-check | 6145 | 0.787 | 0 | { 4.17 11.33 14.79 } |
| review | 6325 | 10.546 | 0 | { 3.70 10.88 14.57 } |
| knip | 6857 | 3.457 | 0 | { 5.13 10.66 14.38 } |
| own-friction | 9347 | 0.047 | 0 | { 3.41 8.30 12.98 } |

The `negative-confirmed` run is the valid unchanged-classification proof: four synthetic classifier failures, four classifier passes, and nine engine passes. The API-exposure-only preparation keeps the original classifier rules and probes; failures identify missing whole-hand requirements, rather than an absent export. The new return-before-hand engine case passes with unchanged engine source for zero and two other original hand cards.

Earlier test drafts failed additional unsupported assertions: a `back` property instead of `backRank`, an absent answer trace despite return selection's forced answer, and ordered void contents rather than UUID membership. These draft runs remain recorded separately. The final contract pins the surviving returned instance, exact original-hand discard events and membership, and the played event on the stack.

The initial generator-output observer used the same scratch filename as its command ledger; the ledger overwrote that capture. The corrected observer writes a separate output filename. Both observer executions exit 0; only the second output supplies the baseline projection audit. The observer redirects the generator's inventory write into private scratch and leaves the checked-in file unchanged.

`focused-final`: **17 tests pass in two files**. `review`: both typechecks, import cycles, changed-file lint and the same 17 related tests pass. Knip runs after review and passes. Source and tests remain frozen after those checks. No browser QA, fuzz or local full review applies to this internal scanner and added contracts; no application behavior, UI, test infrastructure or repository configuration changes.

`friction-baseline` exits 2 on the peer96 record documented in this bead's pre-existing file. It does not provide a valid aggregate trigger report; the failure predates this bead's changes.

## Generated projection audit

The documented command `npx tsx scripts/content-inventory.ts` writes the complete projection. `npx tsx scripts/content-inventory.ts --check` independently recomputes the output and confirms byte equality. SHA-256: `d022ab7e32d4f4dceb6fc6fe73cebbb59d5ee82a185f207c255a06d76355fa31`.

Before the semantic correction the baseline projection has 1,209 entities, 225 planned beads, and 394 pending cards, compared with the checked-in 237 planned beads and 448 pending cards. The original and generated UUID sets match. The parent acknowledged regeneration above the dispatch churn threshold.

Final versus unchanged-classifier baseline: 70 additions and 70 deletions in a unified diff. Only `0bddeb19-ff49-4a77-bc06-955377ba3ed1` and `8e7b0eb9-4933-420b-abee-413bf5b3d2fc` change tags, required forms or prompt kinds. Nine other entities change only their generated positional routing as grouping weights/order recompute. All 1,209 UUIDs, entity content, statuses and catalog paths match that baseline. Regeneration updates the planning projection; filed native scopes and prerequisites govern execution.

The final inventory's Git minimal diff against the base is 2,192 additions and 2,728 deletions. Scanner source churn is 21 additions and 8 deletions. The synthetic tests add one file, 64 lines and nine cases; jsdom delta is zero. There are no fallout edits, engine hub edits, dependency manifest changes or captures.

No server or browser context starts. Every managed command above has a terminal result; the final resource audit checks its recorded PID and the owned worktree path. No runtime resource is intentionally retained.

The isolated own-record fixture passes the strict public `readFrictionRecords` API with the configured tag catalog, exactly one record and no accepted historical unknowns (exit 0, 0.047 seconds). This is independent of the repository-wide peer96 failure. The parent records gate46 after this bead and an acyclic native graph.
