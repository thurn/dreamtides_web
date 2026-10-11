# hv-umm2.370 implementation evidence

- Base: `9b47a0575cde728fd1c636193edea5cb93f66b0e`. Bounded review follow-up to hv-umm2.75; zero authored catalog entities and zero new test modules.
- `abandon` evaluates selector bounds from the source card's paid X through `matchingCharacters`, as specified by `XValue` and RD-hv-umm2.66-1. A card on the stack supplies its stack X; a character in play supplies its retained X; other sources supply zero. The effect's general value X reads its activation/effect environment through the existing value evaluator.
- Production diff: the resolving `matchingCharacters` call supplies state, catalog, predicate, chooser side, and source. The primitive's export, API, selection, movement, event, and prompt contracts remain unchanged. Selectors, evaluator, interpreter, costs, zones, activation, role/copy, fixture, and renderer files match the base. No mechanical fallout or rules decision is required.
- Existing contract module: 244 → 290 lines; net +46 test lines, zero test files or jsdom files. Two activated-X cases join nine existing abandonment cases, retaining the event-source paid-X positive contract.

## Actual negative and green evidence

Before source editing, the fixed-cost source in play had source X=0 and the genuinely played-X source had retained X=1. Each activated its ability for X=3 through public `battleAction` and `answer` intents. Each serialized its pending activation-X slice and compared fresh/original fold replay. The played-X fixture first completed a real play for X=1 into a supplied board slot and asserted retained X=1.

Both baseline cases failed at the observable assertion `expect(fresh.pending(done)).toBeNull()` (contract line 192): the actual enemy abandonment prompt offered both cost-1 and cost-2 instances. This was a pending-result assertion failure, with no scripted-answer exhaustion. The child npm process exited 1, while its recording wrapper exited 0. The parent read the raw negative log/JSON, independently verified the production hash and departed PID, then acknowledged the source edit.

The green cases complete without an abandonment prompt: the X=0 source leaves both characters in play; the retained-X=1 source abandons only the cost-1 instance through the single-candidate choice. Each awards 3 points from general value X, and preserves the cost-2 instance. Fresh/original replay results agree. The original event-source X=2 case still offers exactly cost-1 and cost-2 candidates.

| Command | Child exit | Wall seconds | Host load (1 min / 5 min / 15 min) | Child PID |
| --- | ---: | ---: | --- | ---: |
| `JOURNEY_TEST_WORKERS=2 npm test -- src/engine/effects/primitives/contracts.test.ts -t uses source-card X` | 1 | 3.744 | unrecorded | 89761 |
| `npm test -- src/engine/effects/primitives/contracts.test.ts src/engine/rules/costs.test.ts` | 0 | 3.989 | { 5.78 10.33 10.98 } | 96725 |
| `npm run review` | 0 | 39.811 | { 6.54 10.35 10.98 } | 96937 |
| `npm run knip` | 0 | 3.127 | { 7.10 10.04 10.84 } | 99470 |

- All test/check commands use `JOURNEY_TEST_WORKERS=2`, outside the heavy slot. Focused checks passed 381 cases across primitive/DSL contracts and costs (the primitive runner includes selector-bounds/card-filter-bounds contracts). Review passed lint, cycles, both typechecks, and 157 related files / 2,437 cases. Knip passed.
- No `review:full`, weighted fuzz, browser run, server, browser context, or sweep was needed for this caller-only synthetic selector-bound fix.
- Friction dispatch check exited 0: Phase 5 had 3 uncovered files of cadence 25, and the existing trigger dispositions were present. No duplicate retrospective was filed.

## Failure, interrupt, and recovery coverage

| Path | Existing or new public contract |
| --- | --- |
| Error mid-step and partial write | `rolls back an error after abandonment without partial committed movement, trigger awards, or event publication`: synthetic post-abandon throw preserves committed movement/score, publishes no events, and clears in-flight state |
| Reload/restart at the affected decision | New `uses source-card X for bounds and activation X for values (played X: %s)` cases: JSON-serialized activation-X pending slice reconstructs the same prompt and produces the same result when paid X=3 is answered; retained-X source is genuinely played first |
| Reload during abandonment | `reconstructs its public prompt after reload, rejects invalid, stale, foreign and concurrent input, and accepts once`: serialized public choice reproduces candidates/result |
| Invalid or stale input | Same existing prompt test rejects empty, excessive, duplicate, noncandidate, foreign-side and old-attempt answers while preserving committed state |
| Concurrent actors and duplicate input | Same existing prompt test rejects top-level action/cancel during resolution and accepts a valid choice once, with repeated input finding no prompt |
| Empty eligibility and continued effect | Existing empty/unmatched test plus new source-X=0 case: no abandonment/dissolve/target-failure, trailing value effect completes |
| Movement, ownership, replacements and triggers | Existing both-chooser physical-instance, borrowed Veil/untargetable, created/reclaimed and source/another tests remain active |

This fix uses the existing cloned resolving step and serialized fold decision. It adds no state transition or persistence format; the negative baseline proves that restoring the activation-X override breaks the two new observable contracts.

## Source and test provenance

| Path | Negative before/after SHA-256 | Green checks before/after SHA-256 |
| --- | --- | --- |
| `src/engine/effects/primitives/abandon.ts` | `b257e7c702b1dff324661c7f6c5a951cd22c137dfaf975610f694c58d161b7f7` | `3f96e78a01d45d5b59a7340449292d94333e6fc05e4dbf584f07bcae0280e763` |
| `src/engine/effects/primitives/contracts/abandon.contracts.ts` | `72d31be925e83325f956ee092719decce3dc44377d080ecc7f359bd6908c0c19` | `72d31be925e83325f956ee092719decce3dc44377d080ecc7f359bd6908c0c19` |

Base contract SHA-256: `bc751f02e24a9df176453d5bb1be7fffb719262231be611cf906fdd0e9591807`. Each green check's scratch JSON records a 15-path runtime/source manifest before and after its child ran, with identical hashes. QA-reuse manifests additionally cover the generic picker components before/after final checks.

## Scoped reuse of interaction QA

The hv-umm2.75 report `abandon-interaction.result.json` was read and independently hashed as `06ef4fb099745bd2cd4c68778b753fb3ab56b34dadfb24bf5a67b7210f9a1513`. Its desktop/mobile `LAB.abandon()` fixture uses `p.abandon()` with the default empty predicate `{}` (prompt-lab.ts line 108). That path checks no selector BoundValue; the affected X-bound comparison is absent from that fixture. Its choice/movement/visibility/geometry/error-buffer evidence applies to that unchanged unfiltered interaction. The new bound distinction is verified by the synthetic headless contracts above.

Reused captures: `abandon-picker-desktop.png`, `abandon-picker-mobile.png`, `abandon-selected-desktop.png`. This is reuse of the original report, not a new browser run or a claim that the primitive's whole bytes match.

The following hashes match the original QA source `f2453bd48d3cce8dd1581b540615aa9f7912dce8`, current base, and this worktree before/after checks:

| Unchanged interaction path | SHA-256 |
| --- | --- |
| `src/engine/testing/prompt-lab.ts` | `50ad45716b981e5fbd1e44aa79d20e5af21472a064f6cfecbc13e784fec4357e` |
| `src/engine/prompts/types.ts` | `c0cb75d39f6331d1f2e79a42d41ea476f23cf6dfee03bd48754e0a9a330c5e5a` |
| `src/runtime/battle-prompt-messages.ts` | `e378e371ae7fc60901951aac5598d3a46dc1a8f5967b8b69f9057e2a04adb091` |
| `src/screens/cumulus_adapters/prompt-host-view-model.ts` | `ea91e788bfb0d86c20dd2abe7abeb0a1328162cd2add2a696cc180b1c6ba0bbc` |
| `src/cumulus/screens/battle-overlays/BattlePromptHost.tsx` | `c99f8b6ee21851a23a883130679680021d34903c2d4d7a925400158506475545` |
| `src/cumulus/components/card/CardPickerPanel.tsx` | `b90786be2e576f6d8c3d4ddf4cf542a683307f03652818e9fb1b5978b3cfe6ee` |

## Runtime ledger and limits

- Recorded child PIDs 89761 (expected negative exit 1), 96725 (focused exit 0), 96937 (review exit 0), and 99470 (knip exit 0) were each awaited. Explicit final `ps` checks found each absent; the observed review recorder parent PID 96926 was also absent. All associated tool sessions are terminal.
- Fresh `npm install` exited 0. Its transient initial child PID and exact start time were not captured. Short-lived shell/Python recorder PIDs were not all captured; their tool sessions/subprocess awaits returned terminal exits. No owned long-lived process, listener, watcher, server or browser resource was started or retained.
- Raw logs, child exits, timings, pre/post manifests and QA-reuse hashes are in the owning session's authorized `370-implementation-evidence` scratch directory.
- `implementMin` is a lower-bound estimate from the earliest recorded UTC checkpoint (2026-10-11T12:43:08Z) to evidence creation, rounded to one decimal. Initial installation and earlier reading precede that anchor; exact dispatch time is unavailable. Validation durations are observed wall times, without performance claims.
- The helper issued no Hive/Tollgate/branch/worktree/push/deploy action. Parent session owns independent exact-commit review and candidate delivery.
