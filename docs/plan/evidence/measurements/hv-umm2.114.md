# hv-umm2.114 — cards-02 composition

- Worktree: `/Users/dthurn/dreamtides_web/.worktrees/hv-umm2-114-keyword-cards`.
- Dispatch base: `6e56961d55e58c031491b32c128a900022e0a581`.
- Inventory: cards-02, weight 8.6; five cards, two printed amplified variants.
- Authoring: every printed clause is implemented with existing activated-cost, resource, draw, return, Materialized-trigger, and Reclaim builders. All five entries are authored and carry verified text hashes. Printed data stays canonical.
- D20: these abilities compose existing primitives. The self-abandon cost, discard cost, return target, Materialized draw, and Reclaim payment use their established primitive contracts. No scenario module or new primitive is needed.
- Rules: Ephemeral on `e3193b23-2002-40a9-91fc-e0713200355e` and `b957466e-f748-4a95-89b2-8509dc762223` follows RD-hv-7x4l.8-3: its status ends when a drawn card leaves hand. The rules' activated-cost and Reclaim sections resolve the remaining clauses. No new RD or card issue.
- Test delta: files 0, lines 0, jsdom files 0. Product UI, exported APIs, and fallout files: 0.

## Validation

All heavyweight commands use `lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock` and `JOURNEY_TEST_WORKERS=2`. Queue wait is measured independently of command execution.

- `npm test -- src/engine/content-gates.test.ts`: pass, 1 file / 10 cases, test-run duration 0.847 s; preparation 1.0 s, test phase 1.4 s, local art restoration 0.5 s; host load 8.32 before the check.
- `npm run fuzz:engine -- --games 300 --weight-uuids a9b5afaa-e149-4bf4-9007-077e8e9f12e6,e3193b23-2002-40a9-91fc-e0713200355e,d30bd488-f921-49cb-a44f-353c54cb6548,713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc,b957466e-f748-4a95-89b2-8509dc762223`: pass, 300 games / 152,551 steps / 2,613 prompts; zero failures, 256 interactive replay reruns. Engine wall 60.9 s / CPU 66.0 s; whole command 61.571 s; lock queue 0.022 s; 1-minute host load 7.916. Bounded legality 0, bounded prompts 9; results player 140 / enemy 160 / draw 0.

| UUID | Included | Exercised |
| --- | ---: | ---: |
| a9b5afaa-e149-4bf4-9007-077e8e9f12e6 | 620 | 288 |
| e3193b23-2002-40a9-91fc-e0713200355e | 609 | 312 |
| d30bd488-f921-49cb-a44f-353c54cb6548 | 616 | 482 |
| 713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc | 611 | 210 |
| b957466e-f748-4a95-89b2-8509dc762223 | 611 | 222 |

- `npm run review`: pass, 43.100 s execution / 41.558 s lock queue, 1-minute host load 15.265; lint, import cycles, both typechecks and related tests (137 files / 1,664 cases) passed.
- `npm run knip`: pass, 3.762 s execution / 83.540 s lock queue, 1-minute host load 24.928.

## Source and prerequisite provenance

The original authoring/focused checks/review/knip and weighted 300-game fuzz ran on dispatch base `6e56961d55e58c031491b32c128a900022e0a581`, before provisional source `ff176542fcc6d65490f900bb423f53bd80b3f4b1` at approximately 04:22:48 UTC. The parent updated the same owned worktree after hv-umm2.329 completed at 05:15:20 UTC. Browser QA ran from updated provisional source `06c7b45092aa9039851635a15abc77803acdd62a`, based on `ec45233160bb6fa958b088073ffb1c04bbd1a46a`. The five card compositions are unchanged by that update. The original weighted fuzz results retain their original source provenance; the browser infrastructure update alone does not require another weighted run.

The browser prerequisite interval is approximately 54 minutes, from provisional checkpoint 04:22:48 UTC to parent QA-resume handoff 05:16:51 UTC. It includes waiting for the observed shared-MCP interference to be repaired at its cause in hv-umm2.329, plus bounded ignored-scenario preparation. This is recorded separately from heavy-slot queue waits and command execution, with friction tag `qa-browser-ownership-prerequisite`. Dispatch-to-final-commit time starts at approximately 04:18 UTC and includes this interval.

## Sweep and judged acceptance

- Full five-UUID sweep: **46 pass, 54 ineligible-variant skip, 0 fail, 0 pending**. Every eligible variant runs as player and enemy; the two authored amplified variants are included. Base OID in the 100 sweep ledger records is `ec45233160bb6fa958b088073ffb1c04bbd1a46a`.
- Sweep whole command: 339.966 s; external heavy queue 0.023 s; host load 24.2866. Internal sweep reports 335 s. Browser lease wait is not printed by this sweep interface; its runtime uses the landed native lease.
- D21 SHA first bytes in inventory order: 110, 202, 104, 7, 182. Only `713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc` is sampled. These compositions introduce no prompt/status/visual kind, so the sampled matrix is exactly base × player/enemy × 1440×900/390×844: **4 judged passes**. All accumulated `__caps` buffers are empty.

The player hand play pays the printed five energy, materializes the source and draws two. A separate void source `i18` plus eight real vanilla catalog instances `i19`–`i26` provides a genuine seven-of-eight payment choice. Both viewports verify exact candidate UUIDs/instances, source exclusion, min/max seven, disabled Submit at six and enabled Submit at seven, three energy paid, chosen `i20`–`i26` banished, `i19` retained in void, two draws, and reclaimed status. With six fodder, and separately with two energy, the exact source exposes a passive affordance; an attempted source press preserves committed state and intent history with no prompt, stack item or energy change. Cancelling and reloading a pending cost preserve all zones/energy and prompt identity/candidates. A settled reload preserves the full committed state.

The enemy's initially scripted source `i10` proves the Materialized draw of two and is explicitly excluded as reveal evidence. Separate live AI plays of void source `i19` and hand copy `i28` prove real reveals, dwell at reading width, onward travel, and two draw events in each resolution sequence. Both viewports show payment instances `i21`–`i27` banished while `i20` remains. Energy 10→7 is observed at the Reclaim stack/reveal checkpoint; the later hand play spends five and is observed at energy two. The reported `energyAfter: 7` therefore identifies the Reclaim checkpoint, rather than final enemy energy after later legal plays. The reclaimed badge and plain battle log are visible. Read-only per-game IndexedDB logs contain the precise live AI actions and queued reveal presentations by instance ID; database connections close after observation.

Player report: `cards-02-player.result.json`, command execution 47.113 s, heavy queue 0.021 s, load 4.7236; runner total 41.815 s, scenario 40.509 s, serve 1.245 s, browser lease wait 0.040 s. Calls: desktop 22.346 s / mobile 18.163 s.

First enemy report: `cards-02-enemy-attempt1.result.json`, command 79.787 s, heavy queue 124.267 s, load 4.2104; runner total 74.532 s, scenario 72.609 s, serve 1.853 s, lease wait 0.045 s. It preserves a harness failure: after both intended live sources resolved, a further legal AI play awaited a human response, while the scenario's passive settling waiter stopped sending passes. State reported human response, stack one, enabled pass, and empty errors. This is not a card/product failure. The bounded ignored-scenario correction uses the existing battle driver to drain later response windows; tracked product/UI source is untouched.

Corrected enemy report: `cards-02-enemy.result.json`, command 55.370 s, heavy queue 229.699 s, load 5.7505; runner total 50.107 s, scenario 48.187 s, serve 1.855 s, browser lease wait 0.041 s. Calls: desktop 24.866 s / mobile 23.321 s. Both enemy cases pass. No further browser run is needed.

## Visual judgment

- `salvage-player-desktop.png`: 1440×900, Materialized source on board and two drawn cards in hand. Source travels from hand coordinates (705.48, 732.00) to back rank (254.50, 483.50).
- `salvage-reclaim-mobile.png`: 390×844, seven-of-eight cost selected in a scrolling two-column gallery, fixed readable heading/count and Cancel/Submit footer. Submit bounds (199, 794, 176, 42) fit the viewport; six selections disable it and seven enable it.
- `salvage-enemy-reclaim-desktop.png`: 1440×900, centered actual AI void reveal with printed Materialized and Reclaim clauses; enemy current energy seven at the Reclaim checkpoint. The reveal reaches approximately 240 px reading width on desktop and 175.5 px on mobile, then travels to stack/board. The hand-copy reveal is separately observed in both reports.

The player control row bounds are desktop (0, 585, 1440, 99) and mobile (0, 514.83, 390, 101.28). Plain log bounds fit both viewports; mobile Reclaim log is (12, 112.25, 366, 401.53). Enemy status/control/log geometry is in its report. Captures were inspected and image dimensions verified. All three captures are gitignored primary-checkout outputs, referenced by filename only. The log-close helper uses an uncovered hit point on its existing close control to account for the documented debug-only overlap in hv-umm2.313; the known overlap and its observed QA mitigation are recorded in `docs/plan/evidence/pre-existing/hv-umm2.114.md` with reference to hv-umm2.313.

## Runtime closure

Original fuzz wrapper/group 38448 (engine writer 38483), review group 38961 and knip group 38993 exited. Browser sessions used the landed cross-worktree lease plus the external heavy lock. Their owned dev-server groups are sweep 21166 (Vite child group 21288), player 38051, first enemy 43433, and corrected enemy 49976, each on port 5174. Every runner confirmed its own group stopped and port free; direct process checks find no remaining owned group, server or writer. Browser cleanup confirms closure and settled RPCs before clearing the exact ownership record/releasing the lease. No browser context, watcher, server or storage connection is retained.

## Final validation

- Final `npm run review` on the updated base: pass, 137 files / 1,680 cases; whole command 31.680 s, external heavy queue 0.024 s, host load 10.1377. Related tests 16.870 s (review test phase 20.5 s); both typechecks, lint and import-cycle checks pass.
- Final `npm run knip`: pass, 2.131 s, external heavy queue 17.354 s, host load 15.4214.
- Test delta remains files 0 / lines 0 / jsdom files 0. No new primitive, scenario module, RD, card issue, product/UI source, exported API or fallout path. The card texts retain their immutable printed fields.
- Full review is not required for this content-only composition. All acceptance and required local checks are complete. The single source commit is amended only after runtime closure; final validation writers and materialization-restoration processes are settled.


Approximate dispatch-to-final-commit interval: 80.4 minutes, from parent dispatch note 04:18 UTC, including the separately recorded 54-minute prerequisite interval.
