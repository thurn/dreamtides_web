# hv-umm2.339 — Phase 5 retrospective since hv-umm2.311

## Scope and provenance

The read-only sage helper audited every one of the 31 Phase 5 friction files
uncovered at dispatch, their native bead notes, seven associated measurement
files, QA ledgers, current source, and relevant historical evidence. The
retrospective coverage line lists those 31 IDs. The 20 legacy friction JSONL
rows belong to Phases 1–2 and add no Phase 5 scope.

Audit base: `19d05793708cc0b90b64b35d5907b56091f3225f` in the owned Tollgate
worktree. Native snapshots contain 39 exact candidate statuses, 25 retained
release runs, and 500 history events (sequences 12387–12886). The parent
collected candidate-specific status for every ID explicitly named in the
covered notes, supplementing the bounded recent-history view. All 31 covered
beads have a promoted candidate in that sample. Historical hv-umm2.298 and
hv-umm2.307 collisions are background covered by hv-umm2.311, not new coverage.

## Metrics

| Metric | Sample and measurement | Result | Assessment |
| --- | --- | --- | --- |
| Gate wall | Native elapsed time, 31 promoted candidates | Median 20.785 s; 14.997–33.300 s | Within 60 s |
| Gate step sum | Final passing buildsets of those candidates | Median 20.702 s; 14.909–33.180 s | Separately labeled from wall time |
| Release wall | Native elapsed time, 24 retained passing runs | Median 111.149 s; 97.875–141.687 s | Within 300 s |
| Release step sum | Same 24 runs | Median 111.0335 s; 97.743–141.493 s | Separately labeled from wall time |
| Release full review | Same 24 runs, full-review step | Median 62.147 s; 53.460–78.591 s | Includes lint, types, tests and build |
| Release fuzz | Same 24 runs, 200-game step | Median 43.3005 s; 38.150–58.480 s | Within 60 s |
| Local review | Raw review fields in 31 friction files | Median 38 s; 0.1–65 s | Mixed scopes and host loads |
| Composition review | hv-umm2.113–.116, using .114 final check | Median 38.5 s; 31.680–40 s | Meets 40 s authoring budget |
| Focused checks | 26 files recording focused checks | Median 2.915 s; 1–5 s | Within 10 s |
| Tracked suite | Audit base | 220 files; 79,250 lines; 50 jsdom files | File cap met exactly; jsdom below 80 |
| Suite duration | hv-umm2.61 retained final finishFullTest evidence | 27.63 s | Below 60 s; not a fresh low-load benchmark |
| Test delta | 31 covered friction files | +2 files; +3,071 lines; +0 jsdom | New files recorded by .116 and .329 |
| Default content sweeps | Eleven matrices, using .61 final matrix | 680 cells: 324 pass, 356 skip, zero latest fail | Respective source provenance retained |

The preceding retrospective records gate/release medians of 18.1/103.6 s.
Current samples remain within budget. Different sampling and host conditions
prevent attributing the difference to code. Four documentation-only reviews
are below 0.5 s; comparing the mixed local-review median with Phase 4's
11.6 s median would confuse scope with speed. There is no established series
of three comparable-load checks exceeding a budget by more than 50%.

## Delivery, integration and test growth

The 39 sampled candidates comprise 31 promoted, five failed, two canceled,
and one merge conflict. The five failed validation attempts consumed
88.630 s of direct check time, excluding diagnosis, queues, reviews and
replacement gates.

- hv-umm2.58 failed twice through shared cards.test.ts integration: duplicate
  imports, then duplicate LookingSource. Its final promotion contains the repairs.
- hv-umm2.56 needed a pre-candidate merge repair in cards.test.ts/dsl-cards.ts;
  its sampled candidate passed.
- hv-umm2.116 failed when integration with .331 made cardDrawn.instance
  nullable. A scenario null guard repaired this event-contract integration.
- hv-umm2.329 first failed native containment because synthetic subprocess
  fixtures escaped the gate process group. Same-worktree repair preserved
  production containment. Its later inherited failure came from .116's
  integration and is not a second introduced browser-lease defect.
- hv-umm2.330 had the sampled textual merge conflict in engine-design.md;
  its replacement retained the peer trigger entry.

The frozen release window contains 24 completed passes and one running run,
with one-commit lag and no block reasons. These bounded records do not establish
every release outcome throughout the whole retrospective interval. A later
parent observation found release green with zero lag and no holds.

Existing hv-umm2.314 addresses shared primitive-test appends and the
2,263-line cards.test.ts. It remains blocked by .319; its anticipated file
reduction is not achieved evidence. There are 52 tracked test files above
500 lines, including triggers.test.ts at 1,522 and costs.test.ts at 1,010.
Some have documented contract/tutorial exceptions. Length alone does not
substantiate another recurring-cost filing. Execute .314 and retain these
growth measurements rather than duplicate its scope.

## Waiting and performance attribution

Waiting is recorded separately from execution:

- hv-umm2.114 records about 54 minutes awaiting browser prerequisite .329,
  including bounded scenario preparation. Its separate heavy-slot waits are
  41.558 s for original review, 83.540 s for knip, 124.267 s for the first
  enemy attempt, and 229.699 s for the corrected enemy attempt.
- hv-umm2.61 records interrupted sweeps of 300.640, 23.290 and 68.240 s,
  followed by final acceptance. Final check/browser heavy waits are
  22.522/39.044 s.
- hv-umm2.322 records about 81 s of heavy-slot wait; .310 about 220 s.
- Review availability failures and this retrospective's original claimant's
  usage-limit interruption have notes but no complete reliable wall series.
  Total usage/prerequisite wait and idle-lane percentage are not calculable.

Completed .329 addresses the demonstrated shared CLI browser ownership cause.
Two history events reporting dirty-primary browser-qa.lock match its repaired
runtime-artifact admission issue.

hv-umm2.316's common-base interleaved experiment isolated approximately 7.5%
net CPU-per-step growth. The earlier release comparison of 40.6 to 54–62 s
compared host load around 4.5 with load around 30 and does not establish a 27%
code regression. The implemented change achieved 12.4% CPU and 14.1% wall
reduction across five paired rounds with identical summaries; the 200-game
comparison achieved 12.9% CPU reduction. Its serialization invariant retains
the stronger contract. No additional performance filing is supported here.

## Content recipe and QA

The four composition beads have weights 7.4–8.6, four to six entities and
implementation records of 13/80.4/25/25 minutes. Subtracting only .114's
explicit 54-minute prerequisite interval leaves 26.4 minutes for its other
work and waits. Current sizing is supported; no weight change is proposed.
Their default sweeps take 310–502 s. Seven primitive beads range from 6–65
implementation minutes and 65–282 sweep seconds; .66's reported 45 minutes of
area widening explains its overshoot.

QA outcomes retain source and failure provenance:

- .61's ten historical failed sweep rows have matching later outcomes; its
  final matrix is 30 pass/30 skip/zero fail, with four desktop/mobile X0/X9
  workflows passing.
- .114 retains original weighted-300 provenance, 46 pass/54 skip sweep and
  four judged passes. Its first enemy harness-stall report is separate.
- .56's opponent-hand picker failure is repaired by .310 and rejudged by .313.
- .115's effect-energy log failure is repaired and rejudged by .337.
- .58's mobile choice overlap remains owned by open .325.
- .332 owns declared rank/supporter/energy/opponent-hand/scripted-enemy setup;
  its ready status does not disposition the scene-unreachable trigger.
- .334 owns mandatory whole-hand discard support; .338 owns floating-trigger
  badge/log source attribution.

## Review dispositions

Other-family dispositions are recorded for .56/.58/.65/.66/.70, with remaining
accepted work in .335/.336. The exact Claude review of .69 is complete and
its catalog finding is repaired by .330. .329's broad and fixture-delta
reviews are complete. .312's earlier debt was cleared by cold Claude review
and .324 completed its follow-up.

The only frozen native review-debt label is .61, for final range
ec45233160bb6fa958b088073ffb1c04bbd1a46a to
8b922066992226cc3f36d9ac5c13d3dfe5b4dffa after a session-limit failure.
Its checkpoint review does not cover that final range. Debt remains with the
original session and the plan's gate fallback; this retrospective does not
claim it resolved or manipulate that session's resources.

D18 explicitly governs review cadence. .316 is not core-review; .318 extends
existing Discover policy and its chooseNumber role, adding no primitive or
DSL form. Size alone imposes no per-bead review under this plan. Neither is
classified as debt on that basis. .315 covers role-registration completeness.

## Filed follow-ups and trigger disposition

- **hv-umm2.340**, qa-event-observation/phase-5: developer-only typed event
  observation. .58/.65/.70 report 10/15/10 minutes of scripting friction
  involving absent source, side or cards in the debug probe. The combined
  35 minutes is not an isolated API-cost estimate. Source inspection confirms
  projection to sequence/kind/raw-string instance. .308/.323 readiness,
  .332 staging and .315 role routing cover different causes. The bounded fix
  preserves branded identities and existing event provenance and supplies
  read-only observation/cursors. It waits on .332 for shared QA bodies/docs.
  Claimed speed changes require comparable before/after evidence and at least
  10% improvement; reliability contracts use no timing CI thresholds.
- **hv-umm2.341**, qa-browser-ownership-docs/phase-5: align the workflow's
  Browser QA paragraph with .329 and README. Distinguish owned server ports
  from the shared CLI MCP provider and its lease. The audit does not establish
  blanket interactive-tool isolation. It waits on .332's QA documentation.
- **hv-umm2.342**: resolve the own-Dissolved controller question recorded by
  .333 when a stolen character goes to its owner's void. The parent verified
  .333's own pre-existing file and found no existing owner for the ambiguity.
  Use the D10 ladder before deciding whether implementation changes are
  needed; retain .333's armed/leave-play controller contracts. This separate
  core-review rules task depends on completed .333.

All three are prerequisites of the Phase 5 gate .46. Native cycle checking
reports no cycles. No duplicate is filed for existing .314/.315/.325/.332 or
the other accepted follow-ups. The coverage line leaves the existing
qa-scene-unreachable-state/phase-5 trigger undispositioned until .332 actually
fixes it. No new trigger disposition is supportable in this retrospective.

## This bead's validation

Fresh worktree installation completed in 3 s. This is documentation/evidence
work with no runtime, production code, tests, exported APIs or fallout change.
Test delta: zero files, zero lines, zero jsdom files. The read-only helper
started no runtime or writer. Parent documentation review and knip results
are recorded with their execution/queue timings in this bead's friction file.

Documentation review passed in 0.187 s (no applicable source checks); knip passed in 4.026 s. Combined heavy-slot queue 0.021 s; start host load 5.41. The coverage check reports Phase 5 at 1/61 records since this retrospective, below cadence. Its exit one identifies the existing .332 trigger awaiting a fix, not missing retrospective coverage. Validation wrapper and children exited; no runtime or writer remains.
