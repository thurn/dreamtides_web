# hv-umm2.193: current-turn card cohort evidence

Native scope is the original four UUIDs and cards-81 slug, with all original acceptance retained. Base is `720427f116ca72debf9faca06b84c4e1a8b1b865`. Inclusive audit/implementation dispatch starts at 2026-10-14T19:25:21.429Z (native journal ordinal31909/call_e1c619ab15e74dd98e50b3be48656faf). Exact entity output, source hashes, receipts, load, callers and resources are in `hv-umm2.193.json`.

## Clause audit and source boundary

| UUID | Printed clause | Public composition and witness |
| --- | --- | --- |
| 2d0a7c62-29b5-433b-9b0e-c3dd7630ccc7 | Each played card makes a 1✦ Ethereal; amplified 2✦ | `event(materializeFigments(Ethereal UUID, playedThisTurn(), { spark }))`. `commitCardPlay` records the source play before its event; the live resolution count includes it. Catalog Ethereal UUID is 3eddb1b8-95f2-4688-a1b3-f523a13ce0af. |
| d217303e-b115-484a-b22c-0e44d5701389 | Cannot be prevented; gain 2⍟ per played card | Existing `keyword("cannotBePrevented")`; `event(gainPoints(times(playedThisTurn(), 2)))`. Existing Prevent targets set preventable and the selector rejects that keyword. |
| 2305722e-59c1-47d7-9e05-dc1c32c946a2 | On each played card, gain 1⍟ per other played card | Existing `whenYouPlay()` and `gainPoints(plus(playedThisTurn(), -1))`: live count at trigger resolution minus its triggering play. Default functional play zone; the source's own initial play counts for later plays. |
| 70306382-ac0d-4b08-843a-23efb3835c94 | Materialize all current-void characters discarded this turn; self-discard gains Reclaim0 | `materialize(discardedIn("void", { cardType: "character" }))`; `whenDiscardSelf()` in zone void grants `thisCardIn("void")` Reclaim with `energy(0)`. Physical completed discard cohorts from either hand are matched once in current zone order; grant duration defaults permanent. |

Normative rules settle every clause: Current-turn occurrences and physical membership; Current-zone discarded membership; Materialize; Reclaim; Prevent; D13–D15. Existing RD-hv-umm2.100-1, RD-hv-umm2.691-1, RD-hv-umm2.78-1 and RD-hv-umm2.494-1 supply the relevant contracts. D10 ladder was not invoked; no new RD or card issue.

Only four leaf modules, one 103-line private scenario module, and own evidence are staged. Printed/catalog data is immutable. Runtime, engine, DSL readers, zone/stack/cost/trigger bodies, save/view/policy/loop bodies, shared tests, UI, QA harnesses, configuration, generators and specs/index are read-only. Mechanical fallout is empty. Knip found no unused export/file left by this change.

## D20 and verification

The auto-discovered cards-81 scenario module has 12 cases using actual engine.apply actions and stable synthetic companions on both seats. Cases cover source-inclusive current-turn counts, both Ethereal sparks, each triggering play excluded, earlier source play counted, duplicate physical discarded characters, noncharacter/unrelated void exclusion and zero-energy self-Reclaim followed by ordinary banishment. Existing primitive contracts cover count reset and copy exclusion; these are not duplicated. Test delta: zero new entrypoints, one plain module, 103 added synthetic test lines, zero jsdom files.

The first focused attempt had10 pass/2 fail because its expectation used chronological discard order instead of the current void order. The production encoding was correct. Corrected focused12 pass (1.865s wrapper); coverage20 pass (1.727s). The initial focused wall is unknown; Vitest reported1.51s.

Weighted300 passed:100875 steps,6981 prompts,768 interactive re-runs, zero failures. Wrapper wall294.814s; fuzzer reported293.6s wall/314.8s CPU. Target inclusion/exercise:614/113,609/61,612/109,616/151 in the UUID table order. Actual heavy lock was held only by weighted fuzz. No performance comparison is claimed.

Full-default Node preflight passed46 cells/skipped34 ineligible/fail0 (1.447s). Full-default browser sweep covers all four UUIDs/all eligible variants/both controllers:46 pass/34 skip,80 effective cells and80 raw attempts, no retry/failure. Sweep invocation `sweep-Gb5eRK`, actual slot1/port5274/server group40487, wrapper286.249s, cleanup reported port free.

Ordinary review passed253 files/6854 tests, both type projects, lint, cycles and friction schema (53.328s at starting load6.650); sequential Knip passed (4.530s at starting load13.261). Full local review is not required for this leaf/private-spec scope. Final evidence schema and whitespace checks accompany the packaging receipt.

## D21 and actual player QA

D21 first bytes176/240/245/237 are all unsampled. These cards use existing prompts, statuses and visuals. Ten voluntary entity/variant/viewport judgments pass with actual DOM and physical source/UUID proof, visible battle logs, geometry and empty Caps. Reload compares exactly sides, instances and turnLog; it is not a full-state-hash assertion. Declared synthetic companion art is placeholder output.

- `run-Qpn637` desktop calls0–2 individually completed and returned before step3 failed. The retained exact caller includes board/log/geometry/reload assertions before each return; six captures and ordered navigation/call records prove completion. Its overall report is failed and final raw return objects are unavailable. These three individual calls supply desktop count/point judgments only.
- `run-1Ywj5E` passed First Encounter on desktop/mobile. Actual visible chooser offers View Your Void; the real gallery tile has Reclaim badge/affordance and a hittable box. At zero energy its real void play materializes i3/i2, leaves event i4/unrelated i14 in void, banishes source i5 and reloads identically in the inspected fields.
- `run-T4xWwp` passed the remaining mobile count/point workflows and preserves full per-step raw success notes. Base/amplified Call each makes three exhausted1/2-spark figments. Illumination plus staged Soloist yields actual awards1,2,6 and score9.

Four failed caller attempts are retained: debug rail/hit handling (`run-rkGcPJ`), incorrect lab initialization log predicate (`run-8jkSZs`), pile-to-gallery premise (`run-Qpn637`) and narrowed absent-overlay diagnostic (`run-bCL5Zm`). Corrections use observed current controls and exported schemas. No product defect is established; subsequent qualified pass rows retain their relationship to these failures.

Representative inspected captures (filenames only): `cards-81-0-desktop.png`, `cards-81-log-2-desktop.png`, `cards-81-1-mobile.png`, `cards-81-log-2-mobile.png`, `first-encounter-reclaim-mobile.png`, `cards-81-3-desktop.png`. Invocation identities disambiguate them. All22 PNGs are ignored and hashed in structured evidence.

## Resources and failure applicability

Every owned runner/client/context and server is terminal. Server groups40487,47037,52055,54554,22730,52679,65756 report cleanup and free ports. Recorded validation groups33905,34046,34433,34640,40457,47009,52010,54519,22683,52632,65709 were absent at packaging. Final review/Knip and packaging groups have separate terminal receipts. The shared provider and other owners are preserved.

This composition adds no engine transaction, prompt/input kind, persistence writer or concurrency protocol. Existing clone/commit, answer validation, fold replay, per-game lock and AI turn protocols govern errors, partial writes, stale input and concurrent actors. Actual browser reload covers persisted outputs/history; weighted fuzz covers invariants and interactive replay. Pre-existing source/product issues: none found. Resource settlement is verified again before commit.
