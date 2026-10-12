# Phase 5 retrospective since hv-umm2.511 (hv-umm2.525)

Scope: the 26 Phase 5 friction records uncovered at claim time (staging
3b814c0a2), frozen in the bead notes. A read-only sage audit read each record,
its native notes, pre-existing and measurement files, the QA invocation
results, the Tollgate gate, review-full and fuzz logs, and a scratch copy of
the Tollgate state database.

## Friction in scope

766.5 implementation minutes (median 25); 18 friction entries totalling 151.1
minutes; median host load 8.7 (3.4–30.5). `npm run friction:triggers` exits 0:
every fired tag trigger already has a disposition and no new tag reaches 3
beads. The fuzz-smoke budget trigger below has no tag form.

| Cause | Beads | Disposition |
| --- | --- | --- |
| Release fuzz smoke (`fuzz:engine --games 200`, budget ≤ 60 s) ran 94.2–115.2 s on all 23 release runs (median 98 s). Tested 3874aca917 ran 101,479 steps in 61.2 s CPU; the next tested tree 9e304b0868 (hv-umm2.436 alone) ran the same 101,479 steps in 100.2 s CPU (+64 % per step). Content beads' 300-game weighted fuzz holds the heavy slot 50–60 s longer (127–172 s) | release stage; every content bead | hv-umm2.526 |
| A provider MCP timeout followed by "Session not found" leaves a `call-and-close-unconfirmed` owner record; waiters pass over that slot until reconciled by hand (slot 0 ~22 min on .149, slot 1 ~24 min on .143). Sweep waits of 463 s (.163), 472 s (.157), 351 s (.143) and judged-run waits up to 322 s fell inside the slot-1 quarantine; waits outside it were ≤ 0.04 s | .143, .149, .157, .161, .163 | hv-umm2.527 |
| An explicit `--port` collides after a lease yield onto the other slot | .143 | hv-umm2.528 |
| Rules decisions cite rules.md or RD anchors as D10 Ladder step 1; two beads corrected one RD each and about two dozen carry the pattern | hv-7ewx, hv-y030, .143, .157, .476 | hv-umm2.529 |
| Primitive beads land without retiring or correcting their inventory marker (`boundSourceSpark` still probes `BoundValue.sourceSpark` after .501 landed `SourceSparkValue`); stale prompt-kind predictions | .141, .143, .157, .476, .501, .516 | hv-umm2.530 |
| Review follow-up chains (.489→.509→.519, .91→.460→utwo→.520, .472→gum8→.524, .486→.523, .501→.521, .503→.510): 8 of 26 beads, 158.5 min (21 %); real defects fixed by hv-gum8 and .523 | 8 beads | by design (D18) |
| Waiting for low load before a comparable suite reading | hv-mwpi | hv-umm2.522 |
| Gate fd-reuse flake | .473 | hv-umm2.503; 0 recurrences in 24 gates |
| Conditional consumer audit on a core primitive bead | .473 | hv-umm2.307 and the hv-umm2.385 routing table; no composition bead stopped for Areas widening |
| Diverse judged-QA script errors | .157, .472, .473 | hv-umm2.308, hv-umm2.518 |
| Core review waited on a provider usage limit | .460, .472 | outside the repository |

hv-umm2.516 and hv-umm2.517 held: no entity was split out of a composition
bead mid-flight after .516 landed (about 17 before it), and no brief error
occurred after .517. Two pre-edit stops remained: .143 (the inventory correctly
flagged `boundSourceSpark`, but `bead:entities` was not run before dispatch;
hv-umm2.530 makes that stop part of recipe step 1) and hv-adeo (a single
non-parameterized miss).

## Gate and release since hv-umm2.511 (06:11Z–09:15Z)

- 24 gate candidates promoted, 0 failed, no merge conflicts. Buildsets start
  a median 0.1 s after creation (max 3.0 s); authorization lag median ~12.5 s
  (max 174 s).
- Whole-suite gates (222–269 related files, over the 40-file cap): median
  71.2 s (n = 7, loads 3.3–22.9) before hv-mwpi's 8109a6290 and 69.1 s (n = 7,
  61.0–75.7, loads 6.4–26.8) after. At load ≤ 10 they take 61.0–69.1 s against
  the 60 s budget, a 2–15 % overrun with no trigger. Vitest's own duration
  fell from a median 57.9 s to 52.2 s; `test-gate` spends a median 7.8 s
  (6.3–10.6) outside it, mostly in the related-test graph walk. Watch only;
  hv-umm2.46 re-measures. Focused gates: median 17.6 s (n = 10).
- Release stage: 23 passed, 2 superseded, 1 interrupted and rerun green, none
  red. Median 198.3 s before hv-mwpi (n = 15) and 184.5 s after (n = 8),
  against 228 s in the previous window. The review-full test step fell from
  67.1 s to 52.2 s (−22 %); fuzz is the largest step (median 98 s).
- Suite: 345 test files; tests 4,776 → 4,890. hv-mwpi measured 46.8 s at load
  < 7.5. Local `npm run review` on card and primitive beads: median ~49 s
  (41.7–63.3) at loads 3.4–22.9; outliers .509 (97.4 s at load 3.6) and .473
  (376 s at load 30.5). No trigger.
