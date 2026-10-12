# Phase 5 retrospective since hv-umm2.561

The fresh read-only Sage audit covers 26 completed beads frozen at
2026-10-12T19:38:54.579658Z on `a7490317db77dbcc70eb9cd76bc778d923417493`.
All 60 comparisons of 30 source inputs with their retained copies and the
assigned checkout matched before corrections. The coverage line lists this
exact set; subsequent deliveries belong to the next audit.

No new improvement bead, budget revision, or trigger disposition is
justified by the observed common causes. Existing remedies and unresolved
finding homes remain authoritative. This retrospective corrects three
historical measurement windows, preserving their original hashes, command
receipts, source scopes, and recovery observations.

## Measurements

The 26 exact final candidates passed their gates and completed cleanup.
Their gate step sums have a median of 88.169 seconds and a range of
17.492–98.074 seconds: 21 exceed the 60-second target and 11 exceed
90 seconds. Completion order includes five and three consecutive readings
above 90 seconds. Integration host load is unknown. Earlier local review
samples measure different operations, so the comparable-load condition for
the D42 timing trigger remains unestablished.

The retained release snapshot has 24 successful runs and one running run.
Successful step sums have a median of 210.519 seconds and a range of
196.266–239.218 seconds. Median dependency, full-review, and fuzz steps are
4.710, 104.1725, and 102.336 seconds. Release is pending one commit behind
the frozen staging tip, with no holds or promotion pause. Publication of
that tip is unproven.

Recorded local review readings have a median of 45.110403 seconds across
26 heterogeneous source and selector scopes. Recorded focused readings
have a median of 7.678238 seconds across 22 observations, often several
files. These aggregates are informational. The .569 review field records a
failed attempt; .557 and .567 retain later corrected checks separately.

Twenty candidate-created-to-buildset-start intervals have a median of
0.214330 seconds and a range of 0.117998–166.318491 seconds. They include
preparation, admission, setup, and queue time. Isolated queue wait is
unknown; six older selected finals lack creation events in the retained
history window. That supported 500-event window spans sequences
21648–22147, 17:41:50.465872–19:38:36.115626Z. Six terminal merge conflicts
stopped before CI: .553 twice, .557, .563, hv-xms9, and .568.

The loaded .556 full-suite test phase measured 78.1 seconds at host load
19.6157 with two workers. Existing controlled hv-mwpi measurements retain
the low-load comparison: median 46.8 seconds at loads 3.5–7.5. Current
low-load recertification is unknown. Weighted 300-game runs have a
different scope from the 200-game smoke target; .526 and gate .46 retain
the existing fuzz-performance work.

## Findings and existing homes

| Frozen beads | Disposition |
| --- | --- |
| .197, .553, .564 | Conditional targeting and captured X were supplied by .553/.564; both required reviews settled. Parked intervals, two fixture conflicts, UUID collision, and recovery checks remain qualified gross wall time. |
| .203, .204, .208 | Composition checks and native matrices passed. Inspection, schema-flag, and scope-wording corrections remain recorded. |
| .207, .565 | Genuine determinization failure was repaired by .565 with independent review. The single 21.779191-second overlapping-wrapper mistake and both settlements remain preserved. |
| .212, .568 | Dreamwell execution and immediate effect-play capabilities settled. .568 retains .212's timing correction, source phases, failed fixtures/import cycle/browser observers, additive recovery, and replacement review. |
| .213, .569, .570 | Functional hand staging and rejection metadata were repaired. Drawn-card visual emphasis retains active .566 as its home. Observer failures, rejected launches, reviewer dependency failure, and the 166.057317-second heavy-acquisition interval remain qualified. |
| .214, .567 | Whole-hand redraw capability settled. The recursive review attempt exited 1 after 224.988 seconds; its explicit already-reviewer replacement exited 0 after 210.497277 seconds with no findings. |
| .215 | Parked prerequisites and overlapping separately owned work remain gross wall time. Failed assumptions, stopped attempt, and recovered public transcript retain distinct outcomes. |
| .216, .571, hv-xms9 | Actual drawn-card identity and maximum-only energy contracts supplied the composition. Final forcing/banish-return proof passed; original and final draw-conditional review scopes remain distinct. |
| .218 | Scratch export correction preceded observation. Fuzz wrapper 289.766 seconds includes lock/startup; engine execution was reported as 169.6 seconds. Browser lease was six milliseconds. |
| .556, .572 | Accepted fallback P1 was repaired; parent also caught the declared-front regression before submission. Private automatic-fixture distinction and final independent review settled. |
| .557, .561, .563 | Canonical .558/.563 dispositions remain authoritative. Duplicate hv-ll78 cancellation, evidence collisions, rollback/update recovery, and previous frozen retrospective coverage remain retained. |
| .562 | Accepted hidden-source disabling finding retains active hv-77u6 as its home. Four failed native observers remain preserved. |

Canonical .558/.563 and existing .308/.332/.428/.545/.550/.552 remedies
cover their recorded causes. All fired tags in the retained trigger report
have dispositions. The 41 fixed historical unknown field observations
remain unknown. Full admitted and explicit intended queries found no
duplicate unfinished duty keys; the sole retrospective key is
`phase-5/since-hv-umm2.561`.

## Measurement corrections

| Bead | Dispatch to final Git committer timestamp | Corrected minutes | Frozen minutes |
| --- | --- | ---: | ---: |
| .553 | 15:58:41.006Z to 17:10:35Z | 71.899900 | 70.194986 |
| .557 | 16:57:58.225Z to 17:19:02Z | 21.062917 | 19.361915 |
| .567 | 17:49:42.482Z to 18:06:33Z | 16.841967 | 15.706214 |

Git endpoints have whole-second precision. The .553 native spawn receipt
`call_gmy7y7C5b8KMyKGNPImjIQfS` independently recovers the 93.994 seconds
before its late proxy. Final metadata tails extend .557's cutoff by
102.060078 seconds and .567's by 68.145163 seconds; native notes already
qualify those tails. Each measurement JSON appends the original hashes,
reported window, final source OID, and corrected window. The frozen input
copies stay immutable. Workflow assigns these corrections to the next
retrospective's commit.

## D19 footprint and provenance

Tracked paths matching the configured entrypoint patterns count 351 files,
82 jsdom pragmas, and 84,293 physical newline lines; engine/content jsdom
matches are zero. These are static counts. The previous .561 source has
the same file/jsdom counts and 84,014 lines, giving 279 chronological
entrypoint lines added. Heterogeneous friction totals of three files and
2,235 lines include plain contracts and corrected scopes.

Eight files exceed approximately 500 lines. Six tutorial survivors have
explicit D38 reasons in native hv-47xj.19/.21, their triage ledgers, and
hv-33id.1's Phase 6 contract mapping. The 519-line tooling-card-lab owner
has .572's bounded 525-line correctness admission. The 510-line
friction-triggers owner retains one coherent synthetic CLI/evidence
contract system, unchanged in this window and two percent over the
approximate limit. Historical .539 lacks an explicit size reason; this
current retention reason is recorded in .573's native notes. File and
jsdom count caps are withdrawn in current metrics; suite timing and
recorded size reasons remain applicable.

Source association uses native authoritative source OIDs and each source
commit's own changed friction blob. .197 lacks a Bead trailer; .215 has an
inline Bead marker. Those pre-existing qualifications are retained.
Referenced older .547 and .212's correction inside .568 are excluded from
the 26 final candidate outcomes.

The detailed measurement JSON holds every selected candidate and step
result, frozen input hashes, scopes, unknowns, and correction authority.
Raw native records and source copies are retained under the bead's ignored
`artifacts/qa/hv-umm2.573/audit/` directory. The read-only Sage ran no
validators or providers; inspection errors and their corrections remain
separate from author validation.
