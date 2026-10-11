# hv-ellb: Knowledge ownership verification

- Base: `5977da923fcc21b0a4a535c0c23d1f5071ce5881`. Evidence frozen at `2026-10-11T16:47:28.812360+00:00`.
- Entities: zero. Test delta: zero entrypoints/jsdom files, one synthetic observable contract, +12 net contract lines.
- Production diff: 45 additions and 19 deletions (64 lines including comments); one direct production caller, no mechanical fallout or barrel changes.

`drawMatching` establishes a viewer-specific public criterion from the current source/origin and identical literal filters, then supplies an exclusive removal bound. `forgetFilteredDrawPositions` owns positional forgetting using only viewer-known slots; known selected cards skip before the callback. Public unrestricted top draws and empty anonymous candidate sets preserve tracking.

Both filtered draws and ordered deck placements use the same private inferability calculation: `max(0, U-Q) === min(P, U)`. For one removal among nonempty candidates, ambiguity requires possible slots on both sides of the known card. Existing movement, event redaction, counting and triggers flow through `drawCard`.

The mixed-filter contract passed before production changed. It uses a nonempty synthetic deck with an unknown match before a known matching card and an unknown nonmatch after it. The second literal filter has no match, so the first draw's conservative forgetting is observable in the final enemy view.

| Run | Wall seconds | PID | Exit | Start/end 1-minute load |
| --- | ---: | ---: | ---: | --- |
| install | 2.77 | 32730 | 0 | 4.149 / 4.149 |
| baseline-primitives | 3.845 | 32906 | 0 | 4.045 / 4.045 |
| baseline-knowledge | 2.211 | 33137 | 0 | 4.122 / 4.032 |
| baseline-mixed | 5.586 | 36239 | 0 | 6.791 / 10.170 |
| focused | 3.861 | 48035 | 0 | 20.134 / 18.762 |
| review | 40.199 | 49549 | 0 | 14.859 / 10.292 |
| knip | 3.321 | 50848 | 0 | 9.548 / 9.548 |

- Baseline: 51 draw/placement cases and 7 knowledge cases; mixed-filter positive baseline: 1 case.
- Final focused: 76 passed, 416 skipped, two existing entrypoints; includes all 12 drawMatching, 40 ordered-placement and 7 knowledge cases plus 17 existing knowledge-named primitive cases.
- Review: 256 files / 2623 tests passed. Main types 9.0 s, node types 3.9 s, cycles 1.4 s, lint 3.4 s, related tests 38.7 s; each exit 0. Knip followed review sequentially and passed.
- Every command used `JOURNEY_TEST_WORKERS=2`. All recorded main/descendant PIDs are absent at freeze; no server/browser/external writer was started.
- Retained command logs and start/end/PID/descendant/load ledgers live in the parent actor's `ellb-implementation-evidence` scratch directory; log hashes and runtime records are in the bead friction file.
- QA/full/fuzz: task-authorized behavior-preserving internal refactor needs focused/review/Knip evidence. Presentation and gameplay outcomes are pinned by the existing stable contracts.

Failure and recovery contracts retain their current coverage: failed resolution rolls back draw/count/knowledge; suspended prefix survives JSON reload; wrong-side/invalid/stale competing answers bounce; unpaid cost cancellation precedes the primitive. This refactor introduces no state transition or input path.
