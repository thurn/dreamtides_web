# Phase 6 mason audit

Fresh read-only Codex subagent `/root/mason_tutorial33id4`, `fork_turns: none`.
Exact target: `7b224ed57c5bcbed65b6c962b763269d9b4dc474`.
The subagent completed successfully without mutations, checks, browsers,
servers, native workflow calls or additional helpers.

## Coverage

All 125 inventory paths and SHA-256 values were reconciled, covering an
inventory of 41,426 source/test lines. Deep source inspection followed tutorial
catalog/setup, authored prefix and physical draw frames, policy override
selection/suspension/cancellation/commit, shared first-occurrence history,
journey guidance capture, durable checkpoints, presentation ordering,
gesture rejection and Victory handoff. Core reads included tutorial-specific
implementations/contracts, fold.ts 34–245/295–558/850–884, engine-battle.ts
1–318 and replay identities, slice.ts 1–510, both screen adapters, guidance
builders/controllers and changed screen interaction/presentation boundaries.

Remaining inventory received phase-change/signature/contract inspection and
classification as migration/deletion, mechanical view adaptation, supporting
fixtures/contracts or unrelated surrounding implementation. The audit does
not claim exhaustive reading of every unchanged body, all 4,760 lines of
MobileBattleScreen.tsx, all 3,150 lines of TutorialScreen.tsx or generic save
validators unrelated to Phase 6. No denied reads; clipped combined outputs
were followed by focused core reads. Phase 7 replacement algorithms and the
peer's workflow retrospective were excluded. Project, Mason, Cumulus, relevant
decisions, phase workflow, prerequisite records and recent drop/observer/sparse
array repairs were inspected. These are source findings, not executed checks.

## Finding 1: derive live presentation authority from typed checkpoint queues

P2. Current locations: fold.ts 43–47/92–108;
journey-tutorial-guidance.ts 21–45/133–156; tutorial-presentation.ts
99/108–129; tutorial-load.ts 54–71/101–105. Consumers include reducer.ts
367, engine-ai-driver.ts 149, tutorial-battle-view-model.ts 18–19, guidance
builders/controllers and tutorial lifecycle/controller.

The queue and its stored head mirror both decide behavior: rendering reads
checkpoints[0], while gameplay/AI/controller gates read tutorialPresentation.
The types permit a real pending checkpoint with a null mirror. Journey
guidance also accepts the broader checkpoint union, including opponent-play;
its writer rejects wrong kinds at runtime and the transition's null fallback
can retain the previous queue.

Use one current-presentation selector over the queue for all live readers,
a guidance-only journey checkpoint type and one queue replacement constructor.
This removes split gating/rendering authority, repeated synchronization and
the internal wrong-kind/null/fallback route. Preserve producer seq/index,
retained frames, ordinary item ordering, shared history, authored timing,
manual completion identity, standalone cinematics and prompt suspension.

Compatibility: retain the serialized tutorialPresentation field, refreshed
as a derived compatibility mirror by the queue writer, and retain strict raw
mirror consistency rejection. GAME_ENGINE_CONFIG directly stringifies and
hashes state. Deleting the wire field or adding serializer/hash exceptions
is outside this bounded refactor. Live flow must derive from the queue.

Public acceptance: reuse the two-producer synthetic journey scenario, reload
with a genuine suspended prompt, complete the first exact checkpoint, verify
the second still blocks both actors, reject a stale completion, finish and
answer the same prompt. Preserve JSON/hash and raw mismatch rejection.
Existing journey-tutorial-guidance.test.ts 247–278/333–355 and tutorial-host
contracts provide the useful foundation. Consolidate redundant mirror-only
assertions where these public contracts preserve coverage.

## Finding 2: one declared battle input boundary

P2. Current locations: engine/state/create.ts 124–139/165–229;
rules/battle/fold.ts 464–546/853–879; engine/state/types.ts 43/136–177;
engine/rules/victory.ts 58; battle-setup.contracts.ts.

Create and load independently encode declared setup fields, supported phases,
turn arithmetic, next-battle conflicts, Dreamwell membership, physical indices,
copy/slot uniqueness and resource bounds. Setup types admit contradictory
normal-turn values, and preparation receives that broad declaration rather
than a validated value. One pure engine-owned structural decoder should serve
both boundaries; initialization keeps catalog availability/effective-type
validation before allocation and observation. Preparation consumes the
validated result. The whole save schema remains outside scope.

Include victory eligibility in this coherent input boundary. Replace arbitrary
readonly Side[] authoring/internal types with exactly four accepted tuples:
readonly ["player"], readonly ["enemy"], readonly ["player", "enemy"],
readonly ["enemy", "player"]. A shared unknown-value validator must inspect
every raw array slot, retaining rejection of sparse, empty, duplicate and
malformed arrays. Keep both two-side orders, omitted defaults and exact saved
serialization/hash behavior. A three-case stored enum was considered and
rejected because it changes wire/hash representation.

Public acceptance: retain the synthetic create/load table, atomic rejection
before observations, ordered physical copies, prepared phase entry, result
eligibility, omitted defaults and round-trip continuation. Cover the four
accepted tuples plus omission through creation/load/replay. Keep sparse input
and effective-type cases. Consolidate duplicated table plumbing rather than
adding helper-structure assertions.

## Dispositions and boundaries

Root independently verified both findings against the frozen source, including
the queue/mirror guards, raw load checks, direct compaction codec/hash,
duplicated setup predicates and existing public setup/eligibility contracts.
Both findings are accepted for bounded follow-up filing. The tuple-domain
proposal is grouped with the structural decoder as one coherent boundary.
The initial stored-enum and wire-field deletion alternatives are rejected on
compatibility grounds. Runtime behavior, rendering, authored data and timing
remain binding. There is no additional substantial override, gesture, test
pruning or workflow-cost finding. Shared fold.ts paths concern separate bodies;
filename-only ordering is not justified.

## Filed follow-ups

`hv-33id.15` and `hv-33id.16` each wait for this audit and block `hv-33id.5`. Native graph inspection finds no cycle. The two edits to `fold.ts` own distinct bodies; no filename-only ordering is imposed. Source inspection supplies these findings; follow-up implementations retain their own tests, browser acceptance where applicable, fresh cold reviews and certified delivery.

## Validation and delivery inputs

Documentation review passes in 0.381391 s (friction schema; no source tests selected). Knip passes in 7.734230 s. Both process groups are empty at return. The diff contains four own evidence files and zero test/source changes. Browser, fuzz and full-suite execution do not apply to this read-only audit; its implementation follow-ups retain their own required validation. The inclusive clock starts at claim `2026-10-16T01:42:25Z`; actual ordinary Git return is recorded externally, without a clock-only amendment.
