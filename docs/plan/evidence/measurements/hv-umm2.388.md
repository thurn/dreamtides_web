# hv-umm2.388 lab preflight verification

Base: `a23c624c1ba9c5f57f7399a9cbba00a7566cd6fc`. Native claim:
2026-10-11 15:47:09 UTC.

## Tooling contract

The Node preflight builds the existing card-lab battle, uses the fold adapter
and first legal answers for both sides, and stops at an empty stack without
a prompt or in-flight step before later Day actions. The intent bound lives
in `BATTLE.labPreflight.maxIntents`. Enemy setup includes its scripted,
prepaid play; this does not select an AI policy cast. Optional lab callbacks
retain actual fixture script events while default callers keep the same
results and behavior. Source identity uses the actual scripted play or the
solver's first source hand slot, preserving distinct copies of one UUID.

Content definitions take precedence by UUID, followed by missing lab
definitions. Eligibility and deck entries use the browser lab's existing
content loaders, transfiguration eligibility and engine deck conversion.
JSONL reports UUID, side, variant, physical source, zone, resolution,
submitted answers/passes, ordered engine events and elapsed time. Pending
definitions report pending; ineligible variants skip; classified fixture,
play, engine, progress, zone and resolution failures fail. The browser sweep
remains acceptance. Its timing summary observes its existing run and cleanup.

Six synthetic contracts cover prompt-lab discard, private-card, arrangement
and target fixtures on both sides; fully auto-resolved enemy setup through
the complete preflight callback chain; unsatisfied staging and an explicitly
unplayable fixture; another staged physical copy of the same UUID; thrown
resolution; pending status and guard exhaustion. Test delta: one node file,
70 lines, six cases, zero jsdom files. Tests use public outcomes and events,
with no production data, UI-copy or timing expectations.

## Settled checks

Fresh install reported 2 s. Final focused checks: 25 cases in two files,
3.081 s command wall / 0.445 s Vitest. Review: 2,612 cases in 258 runners,
35.567 s command wall / 29.95 s Vitest, with lint, both typechecks and cycles
passing. Knip: 2.290 s. One required full validation ran under the heavy
slot: 3,279 cases in 323 files, 36.79 s Vitest, 58.777 s command wall including
preparation, static checks, knip and production bundle assertion. Full-check
load start/end: 4.552 / 4.068. This is an observation, not a controlled
low-load budget certification. Earlier local fixture/type corrections are
recorded in friction and retained logs.

All checks and asset restoration finished before either comparison command.
Ten executable/test/helper hashes, including the guard catalog and sweep
timing source, are retained in `frozen-source.json` and matched after cleanup.

## Matched comparison

Both commands used printing UUIDs
`7ea13d02-9d97-492e-9edb-f326eb3b4d1c` and
`967c714f-40c5-4a77-8e22-40691a2755d4`, with
`--variants base,amplified --as both`. All eight UUID/side/variant/verdict
rows match: six passes, two ineligible amplified skips for the second UUID,
zero failures.

Node command wall: 0.919229 s; its main interval: 15.313209 ms, excluding
module loading and process startup/shutdown; load: 3.542. Exact existing
browser sweep command wall: 79.742803 s; load start/end: 3.272 / 4.162.
Browser session timing separates 39 ms lease wait, 1,251 ms serve,
73,185.749834 ms scenario loop, 229.289375 ms cleanup, and 74,732.519583 ms
total. Command wall and session total have different scopes. This is one
sampled workload, not a timing threshold or browser/policy equivalence claim.

The sweep used first-free strict port 5174. Own runner group 17967 and server
group 18000 are absent after actual exit 0. The runner confirmed port free.
Context, active RPCs, provider/client and SDK transport completed normal close
before the shared lease was released. No peer resource was stopped. Browser
verdicts include the existing error-buffer checks. No screenshots or visual
acceptance claim were needed for this tooling change.

Ignored QA artifacts: `headless.log`, `headless.timing.json`, `browser.log`,
`browser.timing.json`, `card-sweep.server.log`, `comparison.json`,
`frozen-source.json`. Comparison SHA-256:
`d3aa7b8686486baedc72a56cf86618ee57a1393464a37cdc9cd57a3f31a6eb74`.
Eight browser acceptance rows are committed in the bead's QA ledger.
