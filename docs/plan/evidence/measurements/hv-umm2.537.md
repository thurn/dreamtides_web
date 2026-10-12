# Phase 5 retrospective since hv-umm2.525 (hv-umm2.537)

Scope: the 27 Phase 5 friction records uncovered at dispatch (staging
134369be4), frozen in the bead notes. A read-only sage audit read each record
(source hashes in the bead notes), its native notes and history, measurement
and pre-existing files, the Tollgate gate, review-gate, review-full and fuzz
logs, and a scratch copy of the Tollgate state database.

## Friction in scope

685.4 implementation minutes (median 18.0); 10 friction entries totalling 72.5
minutes; median host load 9.3 (3.9–26.1). `npm run friction:triggers` exits 0:
every fired tag trigger already has a disposition, and the two new tags
(`provider-completion-proof`, `inventory-fulfilled-marker`) reach one bead
each. Seven records give an `implementMin` longer than their bead's whole
claim-to-close span (≥ 45.9 minutes in total), so the implementation total is
an upper bound.

| Cause | Beads | Disposition |
| --- | --- | --- |
| Release fuzz smoke: median 98.6 s before e49b2b853 and 83.3 s after (−15.5 %); CPU per step 1,063 → 918 µs. Still 39 % over the 60 s budget, never 3 consecutive runs over 90 s. Local 300-game weighted fuzz median 149 → 117.7 s | release stage; content beads | hv-umm2.526; budget revision at hv-umm2.46 |
| `implementMin` is unchecked against a recorded window: 7 of 27 exceed claim-to-close; 5 of 27 record no window; windows start before the claim (.490, .532) or end after landing (.169); three window key spellings | .166, .168, .169, .490, .525, .526, .530, .531, .532 | hv-umm2.539 |
| Review follow-up chains (.532→.534→.536, .513→w0ei, utwo→.520, gum8→.524, .527→.535, 07c9→myhi): the 5 in-scope follow-ups took 48.9 min (7.1 %). The .532 rejection of the abandoned-then-dissolved double fire was not checked against `zones.ts`; it was corrected and fixed in .536 with no extra bead | 9 beads | by design (D18); the rule to verify every finding against the code already covers the miss (n = 1) |
| Composition bead found two primitives after dispatch that `bead:entities` could not see (Pyre Wight's captured "them", Specter's self-abandon look-back); stop cost ≤ 6.4 min, no commit | .167 → .532, .533 | by design (§ Bead sizing); no remaining inventory entity carries the pattern |
| Gate containment failure: a test's descendant process escaped the session (PID 54628); replacement passed 61 min later | .527 | fixed in place; 1 of 30 gates |
| Provider completion proof required a justiciar resolution (19.1 min) | .527 | hv-umm2.527; hardening hv-umm2.535 |
| Browser lease wait 676 s in the quarantine era; 0 s on the two sweeps since | .161 | hv-umm2.527, hv-umm2.428 |
| Judged-QA scripting (tap during card travel, resume, selectors) | .151, .161, .513 | hv-umm2.308 |
| Self-corrected edits | hv-07c9, .161, .513 | ledger reason (hv-umm2.345) |
| Load swings during perf:ab | .526 | ledger reason (hv-umm2.522) |
| D21 judged sample empty on 4 of 7 composition beads: 3 of 26 entities sampled (expected 10.2 %); entities with a new indicator were judged regardless | composition beads | by design (D21) |
| Tollgate `worktree remove` takes a path and refuses while a check retains the base | .524 | outside the repository; non-blocking |

hv-umm2.528, .529 and .530 held: no port collision after c82a2977e; all seven
RDs since fe1577271 separate Ladder steps from rules.md anchors; no primitive
bead since 7c3877a8a carried a pending marker. No retained provider owner
record remains.

## Gate and release since hv-umm2.525 (09:15Z–12:07Z)

- 30 gate buildsets: 28 promoted, 1 failed (.527 containment), 1
  invalidated by regeneration (.533). Buildsets start a median 0.1 s after
  creation (max 2.2 s). Promotion authorization lands a median 9.8 s after
  buildset creation (max 109.6 s).
- Whole-suite gates (68–270 related files, over the 40-file cap; suite 345–347
  files): median 67.6 s (60.6–88.1, n = 20, loads 5.7–18.7). At load ≤ 10 the
  median is 62.4 s (n = 9), against 69.1 s in the previous window. All 20 are
  over the 60 s budget and none over 90 s, so there is no trigger. Vitest
  median 51.8 s; `test-gate` spends 8.6 s outside it. Watch only;
  hv-umm2.46 re-measures. Focused gates: median 17.9 s (n = 8).
- Release stage: 27 passed, none red, 1 running at the snapshot. Median
  178.5 s (162.9–202.2); 186.7 s before hv-umm2.526 (n = 12) and 174.2 s after
  (n = 15). The review-full test step median is 54.5 s at loads 15.7–30.1.
  Release lint is 23.2 s against 20 s and typecheck 11.1 s against 10 s: watch.
- Suite: 345 → 347 files; tests 4,890 → 5,072. No new test file over ~500
  lines; browser-lease.test.mjs and run-scenario-slots.test.mjs sit at
  exactly 500 lines (hv-umm2.535 extends both).
- Local `npm run review`:
  - Composition beads: median 37.7 s (n = 7, loads 3.9–12.0).
  - Engine beads: median 47.0 s (n = 11); one outlier, .513, at 105.5 s
    (load 7.8).
  - Scripts and QA beads: 11–24 s. Docs: ≤ 1 s.
  - No trigger.
- Waiting: the gate queue was negligible. .151 waited on .490; .167 waits on
  .532 and .533; .513 took 179.5 min from claim to close for 62.7 min of
  implementation (serialized after .460). This audit waited about 28 min at a
  session usage limit.

Outstanding at the snapshot: hv-umm2.533 (gated as c2a0398ac, release
running), hv-umm2.535 and hv-myhi (in progress), hv-umm2.167 (open, waiting on
.533).
