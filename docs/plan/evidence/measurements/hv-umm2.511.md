# Phase 5 retrospective since hv-umm2.481 (hv-umm2.511)

Scope: the 27 Phase 5 friction records uncovered at claim time (staging
2f94ff4e0), frozen in the bead notes. A read-only sage audit read each record,
its native notes, QA ledger, pre-existing file, measurements and landed
commit, plus Tollgate history, status, release status and a scratch copy of
the Tollgate state database. Execution times are executed step `elapsed_ms`;
queue waits are listed separately.

## Friction in scope

530.6 implementation minutes (median 18); 6 friction entries totalling 76.2
minutes; median host load 18.0 (5.7–27.5). Every fired trigger already has a
disposition and no new tag reaches 3 beads.

| Cause | Beads | Disposition |
| --- | --- | --- |
| The content inventory routes parameterized printed text ("Abandon X", "Discard X" with a least X, ≤X void targets, "with X✦", spark bounds on CardFilter, Reclaim granted to the triggering card, activations from the void) to fixed-form capabilities, so composition beads split cards into new primitive beads mid-flight (~17 entities across hv-umm2.123, .131, .142, .147, .148, .149, .151, .153, .156, .157, .160) | .153, .160 in scope; earlier beads | hv-umm2.516 (variant capabilities in scripts/content-inventory.ts tag rules; hv-umm2.430/.435 fixed existence probes, not tag routing) |
| Session briefs mis-stated entities: hv-umm2.160 hashed a figment UUID for the D21 sample; hv-umm2.109 paired UUIDs with the wrong names and texts | .160 (and .109 earlier) | hv-umm2.517 (`npm run bead:entities` prints name, text and D21 sample from filed UUIDs) |
| Judged-QA scripting churn after hv-umm2.487: render waits, auto-answered forced candidates, `labStage` base printings, and `tap` not scrolling off-screen gallery candidates on mobile | .160 (6 failed runs), .155, .485, .487 | hv-umm2.518 (scroll-into-view tap, README authoring notes) |
| Tollgate repository Blocked twice (empty-patch item from hv-umm2.473's worktree at 05:22Z; a release-run recomposition after promotion on hv-umm2.158's item ~05:38–05:50Z) | .158, .495, .497 | covered by hv-h2g1 (D16 Tollgate fix, in progress) |
| Gate fd-reuse flake in run-scenario-slots tests (3 gate failures) | .158, .502, .473 | fixed by hv-umm2.503; no recurrence in 5 later gates |
| Server shutdown lifecycle / test containment escape | .491, .503 (.478 earlier) | hv-umm2.503 repaired; hv-umm2.510 in progress; watch (2 beads) |
| Concurrent asset relink during a sweep | .154 | fixed by hv-umm2.480 |
| Review follow-up chains (QA browser infrastructure .478→.482→.491→.503→.510; asset linker .480→.500→.506) | 9 of 27 beads, ~35% of minutes | by design (D18); severity fell to P3 at each link |
| Heavy-lock waits (up to 171.7 s) | .154, .480, .491 | by design (D17) |

## Gate and release since hv-umm2.481

- Whole-suite gate median 127.4 s (n = 20) before hv-umm2.496 and 84.6 s
  (n = 13, 70.0–94.0) after it (−34 %); the tail after `test-gate` finished
  fell from 56.4 s to 2.0 s and the gate log from ~4.2 MB to ~150 KB.
  `test-gate` itself rose 65.8 s → 77.0 s at loads 15–27 while the suite grew
  ~130 tests (not a comparable-load reading). Focused gates 18.9 s → 21.1 s.
- Buildsets start 0–2.6 s after creation; candidate to promotion is gate
  execution plus 0–42 s of authorization lag.
- Browser-lease waits after hv-umm2.478 (two slots): ≤ 0.008 s for the five
  card beads in scope, against 743 s on hv-umm2.131 before it.
- 27 gate candidates since 04:20Z: 23 promoted, 4 failed (3 fd flake, 1 real
  containment escape on hv-umm2.503's own candidate), no merge conflicts.
- 19 release runs, none red; median 228.0 s (206.3–272.6) against 201.3 s for
  the prior 45; review-full median 112.3 s, fuzz median 108.2 s. The release
  stage stays within its 5-minute budget but trends up (Phase 4 96 s, then
  204.8 s, now 228 s); the fuzz-smoke reading exceeds 60 s on every release run
  at unrecorded load. Budgets unchanged; the Phase 5 gate (hv-umm2.46)
  re-measures at low load.
- Suite: 343 test files, 4,737 tests, 82 jsdom files; latest release test step
  71.6 s. Local `npm run review` on card and primitive beads 41–79 s (median
  ~49 s at load ≤ 10 against the 45 s budget; no trigger).
