# hv-umm2.352 catalog and shuffle evidence

Ownership started at 2026-10-11 10:28:40 UTC. Base:
`c61cc0232b2df76837563fce6485c38b773bf8e6`. The assigned Tollgate worktree is
`hv-umm2-352-catalog-shuffle`; the implementation helper makes one local commit
and the parent session owns candidate submission and promotion.

## Identity contract

`createCatalog` validates card UUID uniqueness with `Set<CardId>` before
constructing catalog maps. It rejects both distinct definitions sharing a UUID
and repeated occurrences of the same definition; separate UUIDs remain separate
even when their other metadata agrees. Catalog metadata is read without mutation.
The synthetic regression failed against the base (one failing, one passing case)
and passes with the guard. UUID validation is specific to card definitions.

The landed prompt-lab `choosePlayer` UUID `0x360` and public definitions' UUID
uniqueness contract are preserved. Existing fixture UUIDs support persistent lab
battles and replay. Deriving IDs from object enumeration would bind identity to
field order; deriving them from display names conflicts with the UUID invariant.
The parent session approved retaining explicit fixture IDs with constructor
rejection and the public uniqueness contract. An additional allocation registry
is unnecessary for this accepted follow-up.

## Shared shuffle contract

Both Discover and Shuffle Into call `rules/shuffle.ts` with their battle state
and deck owner. The helper calls `shuffleInPlace(state, shuffle:<side>, deck)`
once and filters each viewer's `knownTo` array in `SIDES` order by membership in
the shuffled deck. Each caller retains its zone changes and announcements.
Discover retains the strict value-based `costGreaterThan` behavior from `.67`.

The paired synthetic contract uses separately valid catalogs, the same source
UUID, and effects that take the sole character from otherwise equivalent decks.
Across both owner sides, two explicit seeds, zero/one/five remaining deck cards,
and nonzero initial counters, the resulting deck order, shuffle-stream counter,
and knowledge agree. Other decks, their counters, unrelated random streams, and
off-deck knowledge are preserved. Re-executing from a serialized input gives
the same state, and the result survives serialization. This contract compares
the two paths without fixing a permutation or the number of random draws.
Existing primitive contracts cover movement, emitted events, suspension, failure
recovery, and multi-owner decks.

## Deterministic equivalence

Before production-source edits and after the extraction, the worktree ran:

```sh
JOURNEY_TEST_WORKERS=2 lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock npm run fuzz:engine -- --games 300 --seed catalog-shuffle-352 --first 0 --interactive-every 10
```

Both runs use the full production/synthetic pool, identical battle configuration,
no requested weighting, ordinals 0–299, and interactive replay every tenth game.
Each game also checks replay against its final hash. The production content
source tree hash, computed as SHA-256 of `git ls-tree -r HEAD src/content`, is
`e458b5a3c3b6edc2448befbb88aad0dad26c790a3f5d462404c6ce59949ba9ea` in both runs.
Content, fuzz scripts, synthetic pool definitions, and configuration are unchanged.

| Semantic aggregate | Baseline | After |
| --- | ---: | ---: |
| Games | 300 | 300 |
| Steps | 149690 | 149690 |
| Prompts | 2708 | 2708 |
| Interactive reruns | 326 | 326 |
| Legality / prompt bounds | 0 / 0 | 0 / 0 |
| Player / enemy / draw results | 156 / 144 / 0 | 156 / 144 / 0 |
| Failures | 0 | 0 |

A one-off comparison parses these aggregates, excludes timing and throughput,
and checks equality. Its sorted, compact JSON SHA-256 is
`b8571948abde15ddb357aecd3723c65a6d11c9201819a4caedf0e873d12bc4a0`.
This is an aggregate equivalence hash, not a stored per-game final-hash digest.
The evidence imposes no CI performance, production-data, or statistical gate.
Baseline: 59.4 s CPU, 54.2 s wall. After: 60.8 s CPU, 55.4 s wall. These
one-off timings describe the runs and make no performance claim.

Raw logs are retained in this worktree's ignored `artifacts/qa/hv-umm2.352/`:
`baseline-fuzz.log`, `after-fuzz.log`, `equivalence.json`, and
`content-source.sha256`. Lock-entry and completion timestamps are recorded for
each fuzz run; their queue delays were not separately measured.

## Verification and resources

- Fresh `npm install` completed before implementation.
- Baseline focused checks: 3 files, 272 cases passed.
- Duplicate-ID regression on the base: 1 failed, 1 passed, 14 skipped under the
  explicit identity-test filter (`catalog-red.log`).
- Focused checks after implementation: 3 files, 275 cases passed (`focused.log`).
- `npm run review` before the final identity-assertion refinement: 157 related files, 2312 cases passed
  (`review-final.log`), with lint, both typechecks and import-cycle checks green.
- `npm run knip`: passed without findings (`knip.log`).
- One `npm run review:full`: 216 files, 2951 cases passed, plus all static
  checks and the production-bundle isolation check (`full.log`).

Initial test authoring produced a BaseSpark-union arithmetic error and a readonly
seed assignment error. `review.log`, `typecheck-diagnosis.log`, and
`review-repaired.log` retain those failed attempts. The final fixture uses an
explicit numeric spark and a new state object with its chosen seed. Full-suite
catalog consumers pass with their existing fixture compositions.

The parent session's cold check refined the positive catalog test to assert
the returned branded UUID, a public lookup contract, rather than retaining a
particular definition object reference. This test-only change follows the full
pass; it changes neither runtime source nor the shuffle equivalence evidence.
The four changed production files' aggregate SHA-256 is
`2d35a718895eb2ee0f1e9aff6ded91a34e3538f54dad95058a63feb11fda5a93`,
computed by hashing sorted path-to-file-SHA-256 entries as compact JSON and
retained in `production-source.json`. This production source is the same for
full review, after-fuzz, and the delivered commit. Exact final core, review,
and knip results after that assertion refinement:

- Final core focused check: 1 file, 16 cases passed (`focused-final-core.log`).
- Final `npm run review`: 157 files, 2312 cases passed; lint, both typechecks,
  and import-cycle checks passed (`review-exact-final.log`).
- Final `npm run knip`: passed without findings (`knip-exact-final.log`).

The successful full-suite evidence is reused across this weaker public-identity
assertion, as approved by the parent session. Production and paired shuffle
contract source are identical to that full pass.

All local tests used `JOURNEY_TEST_WORKERS=2`. Only the two 300-game fuzz commands
and full review took the machine-wide heavy lock. Full review queued and entered
at 10:37:59 UTC and exited at 10:38:54 UTC: 55 seconds execution, zero queue
seconds at whole-second timestamp resolution. Host one-minute load was 4.84
before full review and 20.53 after it. Friction timings sum the wrapper's logged
phase durations; wall timestamps separately capture the full-review interval.

This internal refactor and constructor validation use engine contracts rather
than browser QA. Full review's browser-lease tests use synthetic transports and
close their temporary server groups. Every owned validation wrapper exited;
the final process inspection found no retained worktree-rooted process. No live
browser, server, provider, or other runtime resource is retained.
