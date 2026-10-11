# hv-umm2.348 measurements

Base: `13f08f0aa48282d855177f5c439d28374ddaa363`. Helper start: 2026-10-11 08:20:27 UTC. Executor claim: 08:17:24 UTC. Commit-time gross duration is recorded in the friction entry.

## Observable contracts

The selected dealt definition carries single-X identity in `printedEnergyCost`; when a dealt definition does not match the instance display variant, the catalog supplies printing identity. A null single cost produces the semantic X snapshot. Fixed snapshots carry the engine's effective numeric cost, including deck reduction. Existing multi-orb snapshot cases cover fixed-plus-X and in-battle tax. Figment snapshots retain their numeric branch.

The owning synthetic test file adds six cases, 55 lines, zero new entrypoints, and zero jsdom files. Assertions inspect snapshot cost fields and synthetic engine state. There are no mutable production-data or player-copy assertions.

## Validation

All preparation, validation, and scenario execution uses the external heavy lock and `JOURNEY_TEST_WORKERS=2`. Heavy queue and execution measurements are separate; the runner also separates native browser-lease wait from serving and scenario time.

| Check | Heavy queue seconds | Execution seconds | One-minute load | Result |
| --- | ---: | ---: | ---: | --- |
| First focused | 0.021 | 3.526 | 4.86 | 32 passed, 3 fixture expectations failed |
| Corrected focused | 0.019 | 2.638 | 5.08 | 35 passed |
| Review | 0.020 | 18.557 | 5.23 | 94 passed in 5 files; lint/types/cycles passed |
| Knip | 0.022 | 3.757 | 5.94 | Passed |

The executor performed the fresh install before helper dispatch: 2.504 seconds execution, 0.022 seconds heavy queue, one-minute load 22.354; audit reported 17 findings (9 moderate, 7 high, 1 critical). Install was not repeated. This bead is a bounded presentation adapter correction; the validation ladder calls for focused/review/knip and targeted browser acceptance.

## Retained failed attempts

The first focused run assumed the synthetic fixture's numeric cost was 2. Its actual engine cost is 1, so the correct fixed/reduced expectations are 1/0. The ignored `focused-first-failure.txt` and `focused.timing.json` retain its diagnostic and timing.

The first player harness observed one X glyph but required the full intentionally tucked hand card to fit within the viewport (bottom 920.574 at height 900). Its energy orb was in bounds (x 500.295, y 741.589, size 16.510). Hand acceptance measures the visible orb; held and revealed cards require whole-card bounds. `judged-player-first-harness.mjs`, `.result.json`, `.log` and `.server.log` retain this attempt. Its server process group 98082 stopped and port 5174 was free; caps were empty.

The second harness had a duplicate declaration while adding structured event counts. It failed module parsing before server or browser creation. `judged-player-second-harness.mjs` and `.log` retain it.

The third harness looked for the shared reveal during choose-X. The builder uses the targeting-card stage while the play is held and the shared reveal after payment. `judged-player-third-harness.mjs`, `.result.json`, `.log` and `.server.log` retain this attempt. Its server process group 99050 stopped and port 5174 was free; caps were empty.

The fourth harness captured correct hand, held and paid X snapshots, exact two discarded/two drawn physical events and source completion in the void. It additionally required the presentation probe's resolved event immediately at committed-state completion. Completion acceptance uses the physical source zone, empty stack/no prompt and exact structured discard/draw counts; the presentation event list is diagnostic. `judged-player-fourth-harness.mjs`, `.result.json`, `.log`, `.server.log`, and captures suffixed `-fourth-harness.png` retain this attempt. Its server process group 1062 stopped and port 5174 was free; caps were empty. Its native lease wait was 4.677 seconds, serve 0.948 seconds and scenario 17.745 seconds.

The native runner confirmed browser close, drained provider calls, closed SDK transport, and cleared its exact owner record through each runtime cleanup. All IndexedDB reads use the active page's game query parameter and close their own transaction database handle. The isolated context is disposable; peer storage and runtime resources are untouched.

## Final player acceptance

The final player run (`judged-player.result.json`) passes desktop 1440×900 and mobile 390×844 for both choice routes. Its server process group 13612 on port 5174 stopped; port is free. Native browser wait: 161.071 seconds; serve: 1.861 seconds; scenario: 40.583 seconds; reported total: 203.537 seconds. The external measured execution is 208.817 seconds with heavy queue 0.019 seconds at one-minute load 4.45, including final cleanup outside the report's total.

The source physical instance `i1` carries the canonical UUID through hand, held choose-X, paid choose-player, cancelled play, reload, and completed void state. The observed hand, held choose-X and paid player-choice surfaces each have exactly one X orb; the enemy reveal surface is verified separately below. Legal minimum is 1, submitted/payment X is 2, and energy changes from 4 to 2. Zero energy has a disabled source. Both selection routes produce exactly two physical discards and two draws, and the unselected physical hand is retained. Prompt, cancel, number-picker, submit and player-choice interactions use hit-checked controls. All departing/current error buffers are empty.

Final player captures: `single-x-hand-desktop.png`, `single-x-held-desktop.png`, `single-x-prompt-desktop.png`, `single-x-discard-desktop.png`, with corresponding `-mobile.png` files. `file` confirms the desktop/mobile dimensions. Cold reads of desktop/mobile held and paid-choice captures show the same X identity and readable paid-card text with in-bounds choice controls. The parent independently inspected the final mobile paid-choice capture and accepted its source, text and control composition.

## Final enemy acceptance and runtime settlement

`judged-enemy.result.json` passes both desktop and mobile. The normal scripted play reveals physical source `i12` with exactly one X. Enemy paid X is 2; selected side is enemy; exactly two physical discarded and drawn cards are verified against structured events. The source completes in the void with an empty stack and no pending/in-flight prompt. The persisted records carry source UUID and physical ID from the game query parameter. Readable battle-log lines describe the opponent's play, two discards, and two draws; they are returned as text after state/event verification without a verb-regex gate. Both viewport error buffers are empty.

Native enemy browser wait: 133.655 seconds; serve: 1.860 seconds; scenario: 11.620 seconds; reported total: 147.157 seconds. External execution: 152.457 seconds, heavy queue 0.019 seconds, one-minute load 3.62, including post-report cleanup. Server process group 24898 on port 5174 stopped; port is free. The provider/browser context, SDK transport, own database handles and owned server tree settled before commit. Owned player wrapper 2199/lock 2212/inner 2213/runner 2217 also completed. Shared provider/peer processes and markers are controlled by their owners.

Enemy captures: `single-x-enemy-reveal-desktop.png`, `single-x-enemy-log-desktop.png`, and corresponding `-mobile.png` files. `file` verifies 1440×900/390×844. Cold reads of desktop/mobile reveal captures show readable X, source heading and rules text. The parent separately inspected and accepted the final mobile reveal. Reveal geometry uses visibility and opacity because its wrapper intentionally has `pointerEvents: none`; the interactive log control is hit-checked.

| Revealed source | Card x/y | Card width/height | Orb width/height | Opacity |
| --- | --- | --- | --- | ---: |
| Desktop i12 | 600.099 / 281.518 | 239.802 / 335.723 | 28.773 / 28.773 | 0.998267 |
| Mobile i12 | 107.528 / 297.332 | 174.944 / 244.909 | 24.220 / 24.220 | 0.993809 |

The original `hv-umm2.60` presentation fail is retained; this bead's four judged passes provide its corrected player/enemy desktop/mobile presentation evidence. The reports test the authored workspace delta captured by this bead's final source commit. The QA ledger commit field identifies the workspace base, and the executor binds the exact delivered OID in native bead notes. The original ten successful eligible sweep entries and six mechanics judgments remain tied to that bead's base. No new sweep or weighted fuzz is required for this adapter boundary correction.

Friction normalization uses the existing `browser-qa-scripting` tag for these bead-local harness assumptions. The prior `hv-umm2.60` observation used `qa-harness-assumptions`; its retrospective normalization belongs to the executor workflow, with the shared tag catalog retained. Ordinary native browser lease waits are measured as shared capacity.

Commit boundary: 2026-10-11T08:35:53.710498+00:00; helper gross start-to-final-commit boundary 15.445 minutes. This includes all native/heavy queues, failed attempts and evidence-only finalization.

## Integrated finishing verification

Original authored source: `de6fa1ea1245a07e8c88c20137a2ef2f48e3e8d0`, with parent `13f08f0aa48282d855177f5c439d28374ddaa363`. The original 08:20:27–08:35:53 UTC helper interval remains 15.445 minutes. Executor integration, prerequisite repair and waiting are separate from that implementation measurement. The finishing helper captured its measurement start at 2026-10-11 09:02:51 UTC after the initial instruction/state read; its final amend boundary and separate interval are recorded below and in the friction entry.

The original candidate `01a12a1b-ed97-7623-b740-56f328d9241e` is terminal failed at the gate: source `de6fa1ea1245a07e8c88c20137a2ef2f48e3e8d0`, tested `6db2a8ba8ffba186c203b867b384189d9aa1dd1f`, integration baseline `035f9058f4040ab5b786111db353bfd369c7afc7`. Three prompt-lab failures concern the missing `shuffleInto` surface and illegal scripted answers. The executor's first native update produced clean source checkpoint `899a60bac3cf102f025b42850a0ed60a692936c9` on that baseline. A prior helper reproduced the same three failures with the authored adapter (2.284 seconds) and with the baseline adapter (1.681 seconds), then restored the owned adapter exactly. Both runs used the external heavy lock. The failure-baseline duplicate synthetic UUID `5e5e5e5e-0000-4000-8000-00000000030b` identifies both `LAB.shuffleInto` and `LAB.choosePlayer`, so catalog construction selected a different prompt definition for the scripted answer.

Prerequisite `hv-umm2.351` is promoted, cleaned and closed at exact source/tested `5da790bf43dbce9d2ad7fe399765302bd294834b`. Its synthetic choose-player fixture uses namespace slot `0x360`, and its public-registry contract requires distinct UUIDs. The executor's second native update replayed this bead as `20d7925a3a53e98acbe99931d4a103a7a51f54fd` on that final base; the finishing helper verified a clean one-commit branch. All native update, candidate and authorization actions belong to the executor.

The integrated adapter is byte-identical to the original source, SHA-256 `4ef796947dbfa172fd4338948f931c143cd7d46f585d047b25b598e2c94163bf`. The six-case authored test block is byte-identical, SHA-256 `8f00dbb58d7f243658ad60819f966e8e5a43d89c9cbeb25a1cb03ee96b390142`; the complete added source/test lines match the original authored delta. The test file's inherited difference against the original source is the `shuffleInto: true` prompt-role inventory entry. Existing four player/enemy desktop/mobile judgments and 12 capture filenames remain tied to their original workspace base fields. The executor binds the final amended source OID to that measured authored delta in native notes. The finishing pass changes evidence only, with runtime source/test bytes retained and no additional browser, full-suite or fuzz run.

The prerequisite's full check records 216 files, 2,886 cases, 2,885 passes and one existing committed-deck knowledge recovery failure assigned to peer `hv-umm2.353` (48.404 seconds execution, 49.219 seconds queue). Its same-task justiciar recovery records fix-forward sequencing through mandatory own checks and certified voting; the certified gate passed in 13.619 seconds. This is a known full-suite failure, not a full pass. The peer repair retains its source, shuffle contract and prerequisite ownership. The independent inherited-binding follow-up remains assigned to `hv-umm2.350`.

Every finishing check, including its preparation, runs under external `lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock` with `JOURNEY_TEST_WORKERS=2`. Fresh installation remains the executor's original operation. Focused/review check discovery included one temporary scratch-path pointer beside the six tracked changed files; the pointer was deleted before finalization, with unchanged affected-source selection. Preparation emitted expected missing-art warnings in its hermetic review fixture and restored the local asset links successfully. All linked materializations remain disposable and uncommitted.

| Integrated check | Heavy queue seconds | Execution seconds | One-minute load | Result |
| --- | ---: | ---: | ---: | --- |
| focused | 0.018 | 3.115 | 7.54 | 35 passed in 1 file |
| review | 0.021 | 17.158 | 7.26 | 94 passed in 5 files; lint/types/import checks passed |
| knip | 56.854 | 2.074 | 5.33 | Passed |

The finishing check wrapper, its lock process and all check children completed. It started no browser, dev server, provider, database handle or SDK transport. Raw finishing logs and queue/execution records are retained in the executor-returned scratch location. Original server process groups 98082, 99050, 1062, 13612 and 24898 and their original contexts/transports/handles remain recorded as settled.

Finishing amend boundary: 2026-10-11T09:06:36+00:00; measured finishing start-to-amend interval 225 seconds (3.750 minutes), separately from the original 15.445-minute implementation and the 1,617.290-second executor integration/repair/wait interval. The boundary is the final commit committer timestamp.
