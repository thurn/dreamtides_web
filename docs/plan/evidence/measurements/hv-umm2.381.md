# Phase 5 retrospective after hv-e9fl (hv-umm2.381)

Scope: the 26 Phase 5 friction records uncovered at claim time (staging
f720bdd62), frozen in the bead notes. A read-only sage audit read each
record, its native notes, QA ledger, pre-existing file and landed commit,
plus Tollgate step records (`.git/tollgate/state.sqlite3`, read-only) and
release step logs. Execution times are executed step `elapsed_ms`; queue
waits are listed separately.

## Friction in scope

241.2 recorded minutes over 26 records; median host load 8.4 (4.32–32.89).

| Cause | Beads | Minutes | Disposition |
| --- | --- | --- | --- |
| Subagent stopped for an Areas widening on engine rules plumbing or battle UI components | hv-umm2.76, .77, .78, .81, .88, .371 | 77 | hv-umm2.385 (recipe table mapping mechanic families to plumbing files; widen before dispatch). These files stay out of `engine hubs`: their edits are non-additive |
| Lab-solver staging gaps found only by browser sweeps | hv-umm2.119, .88 (and .369's review) | 34 | hv-umm2.388 (headless card-lab preflight before the sweep) |
| Browser QA scripting: probe misses events before the debug panel mounts | hv-4a0x, hv-umm2.80, .79 | ≈ 20 | hv-umm2.390 |
| Browser QA scripting: the AI never activates a staged ability in judged enemy runs | hv-umm2.78, .371 (and .62) | ≈ 10 | hv-umm2.389 (card-lab enemy script `activate` step) |
| labStage / sweep timeouts under host load 11–35 | hv-umm2.81, .80, .88, .119 | ≈ 30 | hv-umm2.391 (labStage deadline, one timeout re-run, lease wait reported) |
| Duplicate filings (hv-umm2.377 of hv-4a0x; hv-umm2.383 of this bead, cancelled by its filer) | 2 in scope, 4 in Phase 5 | — | hv-umm2.386 (look for an existing bead before filing; act on the duty-key re-check) |
| Worker catalog duplicate UUID | hv-umm2.79 | 5 | fixed by hv-4a0x (8ad67fe22) |
| Missing primitive in the inventory (Reclaim provenance) | hv-umm2.119 | 24.35 | resolved by hv-umm2.373; watch for inventory over-claiming |
| Moved test helpers fail production lint (`no-raw-string-identity`) | hv-uzlx.3, .5 (and .4, .6 unrecorded) | 4 | no work: the D19 splits are done and branded parameter types are the intended fix |
| Merge conflicts on additive registries and docs | hv-umm2.79 (×2), .373, .80 | ≈ 11 | by design (workflow § Serialization edges; hv-umm2.309 recovery) |
| Browser-lease waits | hv-umm2.80 (619.5 s), .119 (279 s), .79 (223 s), hv-2i5z (64 s) | ≈ 20 | by design (browser sessions serialize); hv-umm2.391 reports them separately |
| Core-review follow-ups | hv-umm2.369, .370, .374, .375, .376, hv-2i5z | — | by design (D18) |

`npm run friction:triggers` exits 0; every fired trigger already has a
disposition (`bead-areas-incomplete` → hv-umm2.307, `browser-qa-scripting`
→ hv-umm2.308). No new tag reaches 3 Phase 5 beads.

## Tollgate stages since hv-e9fl

- **Gate stage (budget 60 s):** 46.25 s median over 26 code candidates.
  Engine/content candidates, which run the whole suite at the gate: 56.5 s
  median, n = 14, range 45.8–68.1 s, five over budget (hv-umm2.370 64.4,
  .78 60.5, .373 60.3, .79 64.5, .85 68.1); 56.0 s over the 10 that did not
  overlap a release run. Static checks (8–15 s) run before `test-gate`
  (30–49 s). Selection-only and split candidates 19.6–36.5 s; docs
  candidates 17.5–21.0 s. Approval-to-start queue 1–3 s except 24 s (.79)
  and 7 s (.85). Six candidates were rejected as merge conflicts.
- **Release stage (budget 5 min):** all 28 release buildsets passed first
  time; no red release and no ci-fix. `review-full` + `fuzz` median
  112.8 s (96.3–134.1), up from 99.17 s at hv-e9fl; `review-full` step
  70.7 s, `fuzz` 42.9 s (max 53.6, budget 60 s). In 24 retained logs lint
  medians 23.3 s (budget 20 s, all over, max 30.1) and typecheck 11.2 s
  (budget 10 s, 21 of 24 over); none over by 50 %, host load unrecorded.
  Re-measure at low load at the Phase 5 gate.

## Test suite (D19)

| Measure | hv-e9fl (e1d364815) | Now |
| --- | --- | --- |
| Test entry points | 216 | 321 |
| `jsdom` files | 50 | 82 |
| Files over ~500 lines | 53 | 6 (tutorial files Phase 6.1 deletes or ports; hv-uzlx notes) |
| Entry-point lines | 77,061 | 75,372 |

Suite wall, this bead's heavy-slot `npm run review:full` at f720bdd62,
host load 12.56 (1 min) at start: vitest 41.57 s for 321 files
(import 32.98 s, environment 15.88 s, tests 28.20 s); `[review] test`
41.9 s, lint 18.0 s, typecheck 8.5 s; 66 s wall. Release-log
`[review] test` readings at unknown load: median 41.4 s over 216-file
runs (n = 9), 47.8 s over 321-file runs (n = 4), max 57.2 s. Within the
60 s D19 budget; the Phase 5 gate takes the low-load reading.

## Local checks

`npm run review` on engine/content beads ran 33.6–55.6 s against the 40 s
content budget; over it: hv-umm2.80 55.6 s (load 14.0), .85 52.5 s
(14–17), .119 48.6 s (6.95), .88 48 s (10.8), .81 47 s (11.0).
hv-umm2.387 runs static checks alongside tests and logs load per step.
