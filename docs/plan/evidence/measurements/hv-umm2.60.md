# hv-umm2.60 measurements and acceptance

- Native claim: 2026-10-11T07:26:26UTC. Helper dispatch: approximately 2026-10-11T07:30:20UTC (parent captured immediately after dispatch).
- Base: `b546bc8ca6b14dce6db1f6f6cfe2d648e98068dc`; branch `wt/hv-umm2-60-choose-player`.
- Entire dispatch-to-commit interval includes investigation, concrete scope approval, implementation, validation, queueing, and judged-script repair. Final duration is recorded in the friction file. Parent setup before dispatch is separate.
- One card authored; one primitive; one new role using the existing chooseMode kind; 23 prompt roles. Printed text, null X cost and all printing metadata preserved. No real-card scenario module: all clauses compose existing discard/draw with choosePlayer.
- Test delta: zero `.test` entrypoint files, +263 synthetic contract lines, zero jsdom files. The existing exhaustive role expectation changes one line with zero net lines. One new plain contract module stays under 500 lines.

## Local checks

All preparation/check/browser commands used external `lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock`, with JOURNEY_TEST_WORKERS=2. Wrapper times are wall seconds and include normal process startup/exit. Native browser lease time is a separate field below.

| Run | Heavy queue s | Execution s | 1-min load at execution | Exit |
| --- | ---: | ---: | ---: | ---: |
| full | 38.102 | 48.551 | 5.093 | 0 |
| focused-final | 47.909 | 2.671 | 5.449 | 0 |
| knip | 0.021 | 1.928 | 5.914 | 0 |
| fuzz | 178.873 | 53.847 | 5.490 | 0 |
| sweep | 15.323 | 339.300 | 5.284 | 0 |
| judged | 143.944 | 21.629 | 4.272 | 1 |
| judged-corrected | 0.021 | 80.447 | 3.987 | 1 |
| judged-enemy | 0.022 | 25.920 | 22.851 | 1 |
| judged-enemy-final | 0.019 | 17.438 | 7.177 | 0 |
| judged-player-final | 0.020 | 43.960 | 5.253 | 0 |
| focused-complete | 0.019 | 3.346 | 4.104 | 0 |

| review-final | 0.020 | 5.739 | 11.030 | 2 |
| focused-typed | 0.019 | 2.727 | 4.995 | 0 |
| review-passed | 0.021 | 29.973 | 4.125 | 0 |
| knip-final | 0.021 | 2.045 | 3.638 | 0 |

Initial focused pass: 190 cases / 3 files, prepare/test/restore phases 0.5/2.1/0.5s; initial related review: 158 files / 2,228 cases, reported phase sum 43.9s. Those initial commands were not wrapped with the per-phase queue timer, so no exact queue/load/total wall claim is made for them. Final focused pass includes all 192 cases / 3 files, including optional-cost context and shared mode/target bindings; final related review/knip numbers follow below.

Full review passed 216 files / 2,852 cases, including production build isolation. Runtime source has matched that full-reviewed tree throughout subsequent validation: only synthetic shared-reference/optional-cost cases and own evidence changed after that full pass. Final focused executes those added cases. There was no change to test infrastructure, state schema, prompt kind, PlayerRef or EffectEnv members.

Weighted fuzz: 300 games, 151,343 steps, 3,344 prompts, 342 interactive re-runs; zero invariant/replay failures. Target UUID 50fe6c54-4bf2-4177-a2f7-4c00a4a4c188 included 615 times and exercised 289 times. Fuzzer wall/CPU: 52.3/57.3s; no performance improvement claim.

## Sweep and judged QA

Sweep: 20 cells, 10 pass / 10 ineligible skips / zero fail. Both sides cover base, Inspired, Enduring, Hastened and Perfected. Amplified and the remaining variants are ineligible. Sweep CLI retains its ledger/server log, not openQaSession.wallMs. Measured execution-to-server-log creation is 233.983s and server-log-to-exit is 105.318s. The first includes normal lease waiting and pre-server work; the second includes serving/scenarios/cleanup. Neither is presented as an exact native lease or scenario duration.

- judged-first-harness: native lease 0.041s, serve 1.258s, scenario 14.922s, native total 16.241s; caps empty.
- judged-second-harness: native lease 52.344s, serve 0.947s, scenario 21.860s, native total 75.173s; caps empty.
- judged-enemy-first-harness: native lease 0.045s, serve 0.633s, scenario 19.793s, native total 20.522s; caps empty.
- judged-enemy: native lease 0.039s, serve 0.947s, scenario 11.200s, native total 12.207s; caps empty.
- judged-player: native lease 0.039s, serve 1.858s, scenario 36.688s, native total 38.607s; caps empty.

Mechanics: six judged passes (player chooses self/opponent on desktop/mobile, plus real enemy on desktop/mobile). Real card minimum X=1, insufficient-energy affordance, paid X=2, cancellation before payment, noncancellable player/discard choices, reload at player choice, exact selected discard/draw physical IDs, unchanged unselected hand, source controller and UUID/instance log attribution all pass. IndexedDB transactions close in finally. The enemy log is cold-readable: played, two discarded cards and two anonymous draws, with private drawn identities hidden from the viewer.

Interactive choice geometry: desktop banner x512/y4/w416/h75.5; mobile x19.5/y4/w351/h75.5. Buttons are 63.719×42 and 111.625×42 with an 8px gap, in bounds, opacity 1 and center hits true on both viewports. Mobile buttons begin x198.656 and x270.375 at y522.828. Real reveal is in bounds, opacity 1, and intentionally pointer-transparent; its physical source is i12. Player source is i1; self discard i3/i2 draws i5/i6, opponent discard i14/i13 draws i16/i17. Enemy discard i14/i13 draws i16/i17, selected enemy, paid X=2. UUIDs repeat in the synthetic hands; physical instances remain distinct.

Presentation: one original judged FAIL retained for the single printed X orb rendered as 0 on desktop/mobile player source and enemy reveal. Existing adapter path, confirmed by parent cold review; dedicated D21 fix/re-judgment hv-umm2.348 blocks the phase gate. Six mechanic passes do not erase that presentation failure. No adapter repair is included in this bead.

Final captures: choose-player-prompt-desktop.png, choose-player-prompt-mobile.png, choose-player-discard-desktop.png, choose-player-discard-mobile.png, choose-player-enemy-reveal-desktop.png, choose-player-enemy-reveal-mobile.png, choose-player-enemy-log-desktop.png, choose-player-enemy-log-mobile.png. All use the primary ignored bead capture directory and are not committed. Parent cold-reviewed desktop/mobile controls, selected hands, enemy reveal and readable logs; no additional presentation defect was found.

Three distinct harness failures are preserved: nonexistent window game-id field (corrected to observed game query), hit-testing an intentionally pointer-transparent reveal, and a log regex excluding past-tense “drew”. They are not product failures; all three have empty caps and completed cleanup. Reports/scripts/captures use first-harness/second-harness suffixes. The enemy as-run script is preserved, and the final reusable harness returns displayed log lines for cold inspection rather than English-verb gates.

## Core transition failure paths

- Error mid-step and partial write: `reloads both sequential prompts, rejects stale, wrong-side and concurrent intents, and commits exactly once` resolves a synthetic selected discard + draw then throws; committed hash/hand/deck remain intact, published suffix is empty, in-flight step clears. Mutations are local to the atomic step; there is no independently persisted binding.
- Reload/restart: the same contract serializes/reconstructs both player and selected discard prompts with identical IDs; real browser player-choice reload retains source/id on both viewports.
- Invalid/stale input: the same contract rejects illegal numeric choices, wrong-side answers, old attempts and an old player-choice ID after advancing to discard. The final duplicate answer bounces.
- Concurrent actors: a top-level action while the selected player's discard is pending bounces stepInFlight; only the current prompt owner answers.
- Cancellation/interrupt: paid-X preparation cancels back to its committed state, with no binding/payment; resolution choices reject cancellation. A resolving effect offers no priority window; ordinary stack/trigger protocol owns interrupts. Existing deferred traversal and the new nested contract choose modes/targets only from the selected branch.
- Context preservation: both controllers/sides, X0/positive, source identity, optional-cost paid/declined, trailing you effects, enclosing shared duration expiry, delayed-trigger original-root provenance, and identical target/modal objects reused across enclosing/chosen scopes are covered by synthetic contracts.

## Runtime ledger

Actual QA server process groups 16880 (sweep), 37447 (first harness), 43099 (second harness), 51116 (isolated enemy first harness), 58655 (enemy pass), 59777 (player pass) each served own port 5174 and stopped with port free. Each runner closed its browser/context, drained provider RPC and closed transport before returning. Native lease cleanup completed without reconciliation warnings. All timing wrappers/check/fuzz children exited; the full suite's isolated synthetic lease fixtures also cleaned themselves up. No owned server, browser context, storage writer, watcher or background job is retained.

## Final checks

Final canonical-fixture focused pass: 192 cases / 3 files. The optional fixture uses `additionalCost(optionalCost(energy(1)))`; its paid/declined state assertions pass. Final related review: 158 files / 2,230 cases, lint/types/import-cycle checks pass. Final knip passes with no unused files/exports left by this change.

The first final review rejected only a synthetic fixture's optional cost placed in base CardCost (`TS2322`); the fixture now uses the canonical typed additional-cost ability. The failed typecheck and its timing remain recorded as test-authoring correction, with no runtime source regression or cast.

Root owns native candidate, exact independent Claude review, any integration update, promotion and the .348 follow-up.

Final evidence preparation UTC: 2026-10-11T08:13:25.433095+00:00. Gross interval is rounded immediately before commit; native claim-to-dispatch setup is separate. Queue fields may overlap useful scenario preparation, so they are not subtracted to claim isolated active implementation time.
