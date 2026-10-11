# hv-umm2.342 verification

Base: `bea31d63809d25712e59d0b16c431597a1dca746`. Worktree: `hv-umm2-342-dissolved-control`.

All heavy commands acquired `/Users/dthurn/dreamtides_web/artifacts/heavy.lock`; `JOURNEY_TEST_WORKERS=2`. Queue and command execution were measured separately. Load entries are 1-, 5-, and 15-minute averages. Implementation time covers the full dispatch-to-commit interval, including read-only rules investigation: approximately 05:55–06:06 UTC, 11 minutes. The brief browser-prerequisite diagnosis is recorded separately from recurring friction.

| Check | Queue s | Execution s | Load before | Load after | Exit |
| --- | --- | --- | --- | --- | --- |
| focused | 0.017 | 1.816 | 3.32, 6.60, 8.56 | 3.32, 6.60, 8.56 | 0 |
| review | 0.018 | 34.551 | 2.82, 6.21, 8.37 | 3.13, 5.90, 8.16 | 0 |
| knip | 0.019 | 2.689 | 2.91, 5.67, 8.03 | 2.92, 5.62, 8.00 | 0 |
| fuzz | 0.019 | 35.148 | 3.08, 5.57, 7.95 | 3.13, 5.34, 7.77 | 0 |

- Focused: `npm test -- src/engine/triggers/triggers.test.ts src/engine/rules/zones.test.ts`: 105 tests, two node-environment files, pass. Initial synthetic fixture setup errors were corrected (automatic single-candidate selection and local catalog membership).
- Required: `npm run review`: lint, import cycles, both typechecks, 161 test files and 2,185 tests, pass. `npm run knip`: pass.
- Proportional engine smoke: `npm run fuzz:engine -- --games 200`: 200 games, 99,704 steps, 1,744 prompts, 159 interactive reruns, zero failures or feasibility-bound hits; fuzzer wall 34.4 s, CPU 38.0 s.
- Test delta: zero files, +90 net lines, zero jsdom files. Eight generated synthetic cases cover both last-controller seats, self/other dissolve, owner-void control versus the queued named ability, descriptive/leave-play order, created catalog cards, and figment copies.
- Source provenance: RD-hv-umm2.342-1 uses D10 rung 2, with semantic card scripts and before-state scheduling at archive OID `8b1d9e8243b0ed114d47872dc03c6d97b0e1f7c6`. Catalog text and data are unchanged. No fallback or fallout edits.

## Core-review failure paths

- **Error mid-step:** existing `queues nothing and leaves the committed state alone when the effect fails after the dissolve` pins atomic rollback; `throws, leaving the committed state alone, for an empty queue or a queued ability that is not a trigger` pins invalid resolution. Controller matching introduces no additional commit boundary.
- **Interrupt:** the four new `keeps a stolen named Dissolved trigger … through reload` cases assert that the named trigger's resolution prompt is noncancellable and belongs to its last controller. Existing `suspend and resume through the fold, trigger by trigger, matching the inline run` pins noncancellable triggered resolution. Matching `leftPlay` and `dissolved` is synchronous with no prompt between them.
- **Reload/restart:** those four new cases serialize and reload committed state while the named trigger is pending, verify its source and controller, and compare final state hashes with inline execution. Both viewers see the queued controller.
- **Partial write:** no persistence API or asynchronous write is added. Each engine step commits a complete copied state; the error/rollback contract above covers an uncommitted dissolve and queue. The new reload cases cover the complete queued-controller record after a commit.
- **Invalid/stale input:** the new cases reject the owner's answer to the last controller's prompt and reject the preceding target prompt's stale ID. Existing primitive/zone contracts cover disappeared or replaced targets.
- **Concurrent actors:** engine intents fold serially; no shared writer is added. Wrong-side and stale-prompt rejection above bound competing answers. Both seat/active-side combinations pin deterministic controller and ordering independently of the actor dissolving the character.
- **Destination/replacement paths:** new `fires a stolen created … own Dissolved … before it ceases` cases cover both controllers for created catalog cards and figment copies. Existing zone contracts `a reclaimed character is banished instead of dissolved, without ▸Dissolved, and instead of returning to hand`, Veil replacement tests, and the descriptive dissolve replacement tests pass. RD-hv-umm2.333-1's armed watcher and duration-ending contracts pass unchanged.

## Browser reachability

A logged card-lab workflow for a stolen `a526fa7b-5cef-4da9-a3f2-27ee0bd9b481` requires an authored gain-control source. At this bead base, the only gain-control catalog text is `4ef8b2e7-3525-4c25-aa30-f751467f182f` (`src/content/cards/cosmic-puppeteer-4ef8b2e7.ts`), marked `pending: true`, with no abilities. Its authored implementation is the hv-umm2.190 (`cards-78`) prerequisite. hv-umm2.332 supplies a separate browser-workflow prerequisite. The only executable `gainControl` definitions are synthetic test fixtures. `src/engine/debug/debug-actions.ts` supports add-card, resource/score adjustments, deck ordering, and undo; it cannot change control. Thus `qa.labAddCard` plus normal logged engine actions cannot produce the stolen-card workflow on this source without that prerequisite or an out-of-scope code change. No browser result or capture is claimed.

The proposed future ignored scenario opens an authored gain-control lab, stages Witness under the opponent, gains control via the card's normal target prompt, then dissolves the stolen Witness through a legal challenge or an applicable authored effect. `4408b942-09a0-4f4e-a403-10c708c6e3c5` is restricted to enemies costing at most 2● and cannot dissolve this 3● source. It verifies owner void, the last controller's draw, trigger/event and IndexedDB records, and empty `window.__caps`, through the scenario runner's browser lease and owned server.

Mandatory actual browser verification is tracked by native bead `hv-umm2.343`, with prerequisites `hv-umm2.342`, `hv-umm2.190` (`cards-78`, gain control), and `hv-umm2.332`. The Phase 5 gate (`hv-umm2.46`) depends on `hv-umm2.343`. This bead records headless, fold, event, and view evidence; it makes no browser verdict. The native handoff retains the actual logged stolen-Witness workflow as required work.

Runtime: headless check sessions have exited; no browser, server, or watcher was started. Every runtime group and writer this helper started has exited. No source or validation change is needed for the native QA handoff.
