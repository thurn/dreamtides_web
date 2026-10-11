# Phase 5 retrospective — hv-e9fl

The read-only audit uses source `5beb7d7e36e9ad597a5dd66f2a24af820cd0a0d6`
and the 25 uncovered Phase 5 friction files frozen after `hv-umm2.355`.
The native claim began at `2026-10-11T12:12:29Z`. A single sage helper
performs the audit; this session writes evidence and owns native delivery.

## Frozen inputs

- `hv-31uz`
- `hv-8395`
- `hv-ojiu`
- `hv-umm2.304`
- `hv-umm2.350`
- `hv-umm2.352`
- `hv-umm2.355`
- `hv-umm2.356`
- `hv-umm2.357`
- `hv-umm2.358`
- `hv-umm2.359`
- `hv-umm2.361`
- `hv-umm2.362`
- `hv-umm2.363`
- `hv-umm2.364`
- `hv-umm2.365`
- `hv-umm2.366`
- `hv-umm2.367`
- `hv-umm2.368`
- `hv-umm2.67`
- `hv-umm2.68`
- `hv-umm2.71`
- `hv-umm2.72`
- `hv-umm2.73`
- `hv-umm2.74`

All 25 native beads are closed with `hive_resolution=completed`. Input
SHA-256 hashes are retained in `/tmp/hv-e9fl-friction-hashes.json`; the
frozen selection is retained in `/tmp/hv-e9fl-frozen.json`.

## Validation scope

This change records a retrospective and per-bead evidence. It changes no
runtime source, test entrypoints, test cases, or validation configuration.
Local `npm install` completed in this fresh worktree; its log is retained
in `/tmp/hv-e9fl-install.log`. The native worktree doctor reports healthy.
Required documentation review and unused-code checks pass after the report
is incorporated. A full review, fuzz run, and browser session are outside
this documentation change's verification scope.

## Measured budgets

Native gate durations below are sums of executed `elapsed_ms` for gate
steps. They exclude candidate queueing and observer waiting. The post-356
code sample includes `hv-umm2.356` and excludes earlier `hv-umm2.350` and
the documentation candidates `hv-umm2.355`, `.358`, and `.367`.

| Measurement | Sample | Median | Range | Budget |
| --- | --- | --- | --- | --- |
| Post-356 gate executed steps | 21 unique code candidates | 44.402 s | 18.752–54.606 s | 60 s |
| Release-stage executed steps, `review-full` + `fuzz` | Latest 24 check-passed release runs | 99.1735 s | 94.953–105.664 s | 300 s |
| Release executed steps including dependencies | Same 24 runs | 103.7795 s | 99.244–111.345 s | Separate provenance |
| Release fuzz executed step | Same 24 runs | 39.602 s | Median only | 60 s |
| Retained full-test step logs | Same 24 native retained logs | 34.25 s | 33.0–37.7 s | 60 s |

The latest retained full-test log reports 33.7 s, 216 test files and 3,068
cases. The logs provide no host-load measurement, so these samples do not
certify a fresh low-load benchmark. The tracked suite has 216 entrypoint
files against the 220-file limit, 50 jsdom files against the 80-file limit,
and 77,061 entrypoint test lines. Fifty-three entrypoint files exceed 500
lines; length alone does not identify a new recurring cost. This change's
test delta is zero. The existing budgets stay in force.

The latest full-test sample is release item
`01a12ae0-1b8d-7e13-853b-b7cc155d10dc`, buildset
`01a12ae0-1bc9-70c1-92ed-3fbe3e7801a9`. The gate engine/content subset
of 14 candidates has median 44.727 s: `.352`, `.359`, `.363`, `.364`,
`.365`, `.366`, `.368`, `.67`, `.68`, `.71`, `.72`, `.73`, `.74`, and
`hv-8395`. The monitored gate baseline records this observed coverage
policy and workload; its comparison with the previous 19.9 s sample is
not a controlled speed comparison.

## Exact candidate sample

Every candidate below is freshly promoted with cleanup completed and
successful retained gate steps. Seconds sum `dependencies` and
`review-gate`; broker overhead and candidate queueing are separate.

| Bead | Candidate | Executed gate steps, s |
| --- | --- | ---: |
| hv-umm2.356 | 01a12a58-9fd1-7a81-aac7-de95418b8fe2 | 18.752 |
| hv-umm2.304 | 01a12a5c-fb45-7e82-88e6-318a274b9a5d | 26.032 |
| hv-umm2.357 | 01a12a5e-247e-7011-ae2a-542342f9b805 | 20.527 |
| hv-umm2.361 | 01a12a68-85a6-78d1-ab9a-623b38218d96 | 45.461 |
| hv-umm2.67 | 01a12a7d-c875-7e50-80b8-1fa162679c7e | 43.976 |
| hv-umm2.71 | 01a12a7d-5b39-7f20-8c86-8a72220ca1d4 | 54.606 |
| hv-umm2.362 | 01a12a8a-b742-78e1-9af6-5909645b5516 | 29.756 |
| hv-umm2.352 | 01a12a8f-96cc-7242-b4a7-1d1362d080e6 | 44.402 |
| hv-umm2.68 | 01a12a9b-3fb6-78e2-a89a-90516b3fc399 | 44.746 |
| hv-umm2.359 | 01a12aa1-b460-71e2-b91d-1e7083b46cc4 | 46.801 |
| hv-umm2.73 | 01a12aa7-cd97-7c61-aa46-be035a3be961 | 44.003 |
| hv-umm2.364 | 01a12ab1-4ea7-7550-8876-9ba25beedb49 | 44.412 |
| hv-umm2.365 | 01a12ab3-293c-74a0-ac26-48e51f091789 | 20.812 |
| hv-umm2.72 | 01a12ab4-9dbc-7583-bdfe-71d8ca27c562 | 50.625 |
| hv-umm2.366 | 01a12ac0-dd39-74e3-9f8f-4fcd42123839 | 50.984 |
| hv-8395 | 01a12ac7-69a2-74d1-ab97-312992c444e5 | 48.164 |
| hv-umm2.74 | 01a12ac9-da0e-7042-ac43-f165e2f3b084 | 53.126 |
| hv-ojiu | 01a12acd-fd47-75c1-9a66-3f569a1d5d01 | 24.662 |
| hv-umm2.363 | 01a12ad1-9197-7bd3-8264-3f0ad23083c7 | 44.708 |
| hv-umm2.368 | 01a12ad7-977d-7941-96b5-f5a5e99cb7c5 | 19.406 |
| hv-31uz | 01a12adf-9422-7442-8426-0dda6de7fa36 | 21.242 |

Earlier `.350` and documentation `.355`, `.358`, `.367` have successful
gate sums 18.333, 15.002, 15.272, and 16.875 s respectively. They are
outside the code-candidate median. The frozen friction ledger's aggregate
test delta is +4 files, +2,520 lines, +0 jsdom files; plain contract modules
are included, so these figures do not describe added Vitest entrypoints.
At `.355` source `a2dc6e2f435a6a7e5bdd6b488a16392c0b509172`, the same
entrypoint inventory had 216 files, 50 jsdom, 76,605 lines and 52 files over
500 lines. The actual entrypoint increase in this slice is 456 lines.
Every primitive contract module remains under 500 lines. `.366` records
the coherent existing `engine-battle.test.ts` at 543 lines as an exception.

## Delivery and review dispositions

The audit's bounded `tg history` read contains 500 records, sequences
13725–14224, spanning 09:54:24–12:14:19 UTC. It contains 19 promotion
completions, 19 source-cleanup completions, 19 release passes and zero
release-failure events. Exact candidate states and the 24 retained release
runs supplement this truncated history. All 24 retained release runs are
check-passed with empty failing-step lists and no retry link. The audit
observed staging and release at `5beb7d7e…`, green release, zero lag,
no holds and no promotion pause. These observations concern the retained
sample, rather than every release in the complete plan run.

Two construction conflicts have bounded native recoveries under existing
`hv-umm2.309`: `.359` candidate
`01a12a8b-1993-72b3-b840-bf6a6f30bf0d` records
`merge-conflict-with-adopted-base` and no executed gate steps; its owner
preserved both presentation contracts after the native update rollback.
`.74` candidate `01a12ac8-e054-7761-b164-e77065e58fb1` conflicted in
`docs/plan/engine-design.md` with the adopted putInDeck wording; both
registrations are retained by its successful replacement. These are
integration repairs, not failing CI test cycles. `.355`'s preceding red
release runs belong to its earlier covered slice; `.356` addresses their
large related-selection gate cause.

All accepted other-family review findings in this slice have completed
native dispositions:

- `.67` → `.363`: moved-node authoring validation.
- `.68` → `.364`: nested lab costs, recovery/Interrupt coverage and minimum-X typing.
- `.73` → `.365`: energy modifiers preserve points costs.
- `.74` → `.368`: resolution-time hand, filtered recovery disclosure and deck references.
- `.72` → `.366`: sampled scoring metadata and load-boundary validation.
- `.359` → `hv-8395` → `.367`: inferable positions and partial-failure notices, then documentation.
- `.60` → `.350`, and catalog/shuffle follow-up → `.352`.
- `.71`: exact other-family review returned no actionable finding.

Historical pending fields in `.359` friction and the `.72` note referring
to an open `hv-31uz` retain their original provenance. Fresh native
completed outcomes establish the current disposition.

## Local validation, QA and waiting

Primitive/content review reports range about 29.066–41.066 s. They are
within or close to the 40 s content budget; none reaches its 60 s trigger
threshold. Relevant host loads differ: `.67` 6.85, `.68` 5.93, `.71` 3.58,
`.72` 8.286, `.73` 12.3, `.74` 5.4. Broad `.8395` and `.363` reviews
report 37.525/37 s at loads 25.43/18.71. These unmatched workloads and loads
do not support a speed claim. Nineteen friction entries with focused or
focused-final values have median 3 s, range 1–8.06 s. Some values are
phase sums or estimates, so this is a descriptive ledger statistic.

`.31uz` review gross is approximately 18 s; its overlapping phase sum is
21.6 s. `.366` review 31.7 s is a phase sum. `.352` distinguishes phase
sums from whole-wall timestamps. These values do not form a precise
aggregate wall-time median. `hv-ojiu` full review 63.67 s includes an
unknown external heavy wait; its queue measurement stays null.

Final reported fuzz runs have zero failures. `.352` paired unchanged
catalog/seed runs match every semantic aggregate; 54.2 versus 55.4 s walls
are observations, not a speed comparison. `.68` retains ten initial sweep
failures caused by an empty-void fixture, followed by ten passes/ten skips;
`.364` repairs the nested-cost staging found by review. `.67` retains a
sampled Discover Submit obstruction; `.362` has passing before/after
workflow evidence. `.71`, `.72`, and `.304` retain harness failures and
corrected observations with empty caps. Accepted product defects are
resolved by `.361` and `hv-31uz`; misnested event filters by `hv-ojiu`.
The retracted `.71` metadata hypothesis does not establish a runtime defect.

Waiting has separate provenance:

- `.350`: 188.100 s aggregate heavy wait.
- `.304`: external selected browser-run waits 156.804, 247.453 and 38.206 s,
  preceding `.358`; native browser leases are generally about 40 ms.
- `.359`: actual browser lease 74.872 s, serve .947 s, scenario 19.073 s,
  total 94.914 s.
- `.72`: fuzz heavy wait 40.653 s and execution 57.886 s; full wait .020 s
  and execution 53.044 s.
- `.74`: reported heavy wait 45 s.

`.72` records an eleven-minute scope acknowledgment wait attributable to
root compaction. `.67` has a bounded scope checkpoint/release while its
prerequisite landed. Slice-wide prerequisite wait, usage-limit wait and
idle percentage are unmeasured. Gross implementation intervals use
different bases and estimates: `.366`'s 5.91-minute entry covers part of
its native 450-second claim-to-commit interval. No aggregate gross-duration
median is warranted.

## Recurring causes and outcome

No new improvement bead or trigger disposition is warranted by this
slice. `.357` supplies additive registration hubs; six primitive beads
`.67`, `.68`, `.71`, `.72`, `.73`, `.74` have no recorded registration-file
widening stop. Distinct scoring/cost plumbing widening is outside that
monitor. `.358` governs heavy-resource selection; `.71` records the
correction to a stale dispatch brief. `.308`, `.332`, `.361`, `.362`,
`hv-ojiu`, and `hv-31uz` cover the confirmed QA/tooling/UI causes. The
isolated `.72` scope wait and `.350` fixture cast repair do not establish
a new recurring repository cause. Size-rule and phase-gate monitoring
continues with the current budgets; present suite timing and entrypoint/
environment counts provide no basis for an immediate test cut.

## This bead's completed checks and ownership

Root independently re-read all 21 exact code-candidate statuses and
verified the promoted/cleanup-completed states, executed step sums,
44.402 s median and 18.752–54.606 s range. Full source/tested OIDs and
step records are retained in `/tmp/hv-e9fl-native-code-sample.json`.
All 25 frozen friction hashes remain intact. The sage helper is terminal;
no provider, browser, server, build or storage writer was started by it.

`npm run review` passes in 0.190 s (load
3.31), selecting documentation only. `npm run knip`
passes in 3.978 s (load 3.13).
These light checks used two test workers without the heavy lock. Logs and
monotonic timings are `/tmp/hv-e9fl-review.log`, `/tmp/hv-e9fl-knip.log`,
and `/tmp/hv-e9fl-checks.json`. Both check subprocesses and observer exited
zero. Test delta: zero files, lines, cases and jsdom files.

Native claim-to-evidence gross through 2026-10-11T12:22:22.870164+00:00 is
9.90 minutes; it includes the audit, root incorporation
and required local checks. Install timing was not instrumented and is not
included in execution-only medians. Final candidate timing and release
state are recorded in native notes after delivery.
