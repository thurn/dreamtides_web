# hv-umm2.740: actual tournament worker lifecycle verification

Source base `7c98b941f25ee200ea128ba74c3cb13eaf51f56e`. Scope is the existing actual-worker lifecycle case in
`scripts/tournament/contracts.test.ts`; production and other test bodies are read-only.
The case runs four sequential batches and five actual Node workers.

The established source defect is a verification guard/cancellation mismatch: a
fixed 15,000 ms outer guard covers all four phases, whereas even one catalog boot
is permitted 30,000 ms. Each original batch permits 1,800,000 ms. The worker
bootstrap registers tsx and imports current content modules through the real
catalog loader. Vitest timeout aborts its context signal; the batch needs that
signal and an awaited cleanup join to settle at that boundary.

The local wrapper uses a 60,000 ms batch liveness watchdog: one existing catalog
boot allowance for startup and a separate equal allowance for finite synthetic
game work. Four such deadlines plus one 30,000 ms settlement reserve derive the
270,000 ms outer watchdog. The finished hook awaits the pending batch with a
30,000 ms cleanup watchdog. These are explicit liveness safety choices, not a
speed guarantee, elapsed-time assertion or the production maximum batch envelope.
The case refuses to start another batch after test cancellation. Its real
one-leg abort composes with the test signal.

All original synthetic gameplay inputs, policy budgets and UUIDs are retained.
Baseline4 and one-leg+resumed3 still compare deterministic outcome digests;
resume uses two real workers. The failed request must return the missing card
UUID, so a boot timeout or the callback rejection guard cannot masquerade as the
intended bad-card error. The observer saw an actual error reply before any
completed-game callback on that request. The callback-throw path is not claimed
as exercised.

The six original raw failure/later-green files and their exact filer hashes are
preserved in the ignored archive under `failure-evidence/`; `provenance.json`
records their original source locations. The original aggregate review had
9,128 passes plus a 15,004 ms timeout; isolated verification had ten passes plus
a 15,005 ms timeout. Later corrected-own-import review passed 9,129 tests in
283 files. All three outcomes remain authoritative. Historical records lack
phase instrumentation, so the precise slow phase and all contributing causes
of those failures remain unknown.

One unchanged source-qualified observation passed (5.45 s case, 8.371 s wrapper,
starting load9.672). Its five boot observations were about
1,651/980/1,387/1,416/938 ms. This observation does not reproduce or reclassify
either original failure. The source relation proves that the old outer guard
can preempt a legitimate single boot; the repaired guards budget the four
phases and settlement. No forced delay, counterfactual timeout mutation,
statistical assertion or old-guard failure/pass experiment was performed.

Final focused verification passed all eleven tests in one Node file,
10.849 s wrapper at starting load6.891.
Its observer recorded all five actual workers, all required games and the actual
bad-card UUID error, five resolved termination promises, zero SIGINT/SIGTERM
listeners at termination, and only the runner MessagePort at settlement.
`runBatch` source clears all deadline/boot timers, removes signal listeners and
awaits worker termination before returning. Context signal/finished-hook
semantics were read in installed Vitest4.1.0 declarations and runner source;
no forced outer-timeout path was executed.

Two earlier focused PASS epochs are preserved with their exact local guard
choices in `source-epochs.json`; the intermediate receipt named `final-focused`
predates the boot-plus-work correction. Every additional focused run followed a
source change. No unchanged rerun-until-green was used.

Required validation: accepted-focused: PASS; review: PASS; knip: PASS; schema: PASS; whitespace: PASS. Detailed command scopes, raw receipt hashes,
start/end times, PID/process-group absence, source bindings and host loads are
in the measurement JSON and ignored archive. Ordinary review selects its actual
related aggregate; no local full-review/heavy command is required for this
bounded existing-case edit. No browser QA applies to a Node verification guard.

Test delta: zero configured entrypoints, zero dedicated modules, +13
physical lines in the existing entrypoint and zero jsdom files. No case is
added, skipped or stubbed. No new rules decisions, card issues, foreign writes
or unrelated pre-existing issues were discovered. The parent owns native
review and certified delivery. Original241 and future Phase7.19 acceptance and
gate46 controlled D19 measurement remain with their native tasks.

Implementation clock begins at original dispatch `2026-10-15T10:51:09.103Z` and includes all
source inspection, coordination and validation. This record cuts off at
`2026-10-15T10:59:43.251828+00:00`; `final-commit.json` retains the subsequent normal Git start/end and
exact tail through final Git completion without rewriting dates or amending.
