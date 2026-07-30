# React Effect and Coop Idempotency Audit

Date: 2026-07-14

## Scope

This audit covers every production `useEffect` and `useLayoutEffect` call site
under `src/`, with emphasis on effects that append coop events, invoke journey
mutations, initiate Firebase or asynchronous work, or use local React state and
refs to gate shared game flow.

The review traced candidate effects through the journey mutation facade,
`CoopActions`, `LogClient.submit`, the RTDB append transaction, the fold, and the
domain reducer. It also inspected `logs/journey-log.jsonl` for adjacent events
with matching actors and types, applied/bounced pairs, empty intervening
windows, and identical state hashes.

The inventory contained 268 production effect call sites. The log sample
contained 1,226 `coop_event` records. The relevant adjacent pairs were:

- 299 `SET_CARD_SOURCE_DEBUG` applied/applied pairs from the same actor.
- 8 `ENTER_DRAFT_SITE` applied/applied pairs with identical state hashes.
- 6 `OPEN_SITE` applied/applied pairs with identical state hashes.
- 1 `BEGIN_BATTLE` applied/bounced pair with an identical state hash and empty
  `interveningSeqs`, matching the reference incident signature.

`logs/journey-log.jsonl` is a local production-game debugging artifact and is not
committed to the repository. Its line references below identify the copy used
for this audit.

## Shared append and reducer behavior

Every `CoopActions` method calls the supplied append function in
`src/coop/actions.ts:154`. Each `LogClient.submit` call receives a new
client-local nonce in `src/eventlog/client.ts:341`, even when two calls represent
the same logical intent. The RTDB append transaction in
`src/eventlog/append.ts:74` deduplicates only an identical nonce, so React-level
duplicates are distinct events.

Applied events enter the fold's applied index in `src/eventlog/fold.ts:192`.
The root CAS policy in `src/rules/reducer.ts:73` treats an applied event from a
different actor as a conflict unless its type is decision-neutral. Consequently,
an event that applies without changing the state hash can still bounce a
partner's concurrent intent.

## Confirmed findings

### High: Foresee dispatches a duplicate battle command under StrictMode

Effect and path:

- `src/battle/components/BattleForeseeOverlay.tsx:72` dispatches
  `REVEAL_DECK_TOP` when the overlay mounts or its reveal count changes.
- `src/battle/components/PlayableBattleScreen.tsx:1021` supplies
  `handleCommand`.
- `src/battle/components/PlayableBattleScreen.tsx:295` submits
  `BATTLE_COMMAND` or `BATTLE_GESTURE` through `CoopActions`.
- `src/rules/battle/battle-events.ts:495` applies the battle command.
- `src/rules/battle/apply-debug-edit.ts:534` returns the original board when the
  same cards are already revealed, but the enclosing battle event still has an
  applied outcome.

Concrete reproduction:

1. Mount a Foresee overlay beneath the application root's `<StrictMode>`.
2. The first effect setup dispatches `REVEAL_DECK_TOP`.
3. StrictMode replays the setup with the same `count` and `side`.
4. `onDispatchRef` supplies a current callback but does not record that the
   logical reveal was submitted, so a second event receives a new nonce.

In a single client, the expected event-log signature is adjacent same-actor
`BATTLE_COMMAND` events. The second event applies without changing the board.
Its `stateHashAfter` may be absent because `LogClient` omits predictive hashes
behind a pending intent. With two clients displaying the same shared Foresee
prompt, one command applies and the other bounces with `partner_conflict` and
the first sequence in `interveningSeqs`.

The deck does not reveal twice, but history and command telemetry contain a
duplicate. A losing coop client receives a bounce toast.

The test at `src/battle/components/BattleForeseeOverlay.test.tsx:47` uses a
normal `createRoot` and does not cover StrictMode.

Recommended direction:

- Make reveal state part of the event that opens the Foresee prompt, or use an
  event-log-owned logical intent key.
- Keep opening a presentation component from submitting shared game flow.
- Add a StrictMode test for one append and a two-client test for one logical
  reveal without an own-action bounce.

### High: card-source debug effects perform shared show/clear/show writes

Affected effects:

- `src/screens/DraftSiteScreen.tsx:387`, with cleanup in a sibling effect at
  `src/screens/DraftSiteScreen.tsx:391`.
- `src/screens/ShopScreen.tsx:123`, with cleanup in a sibling effect at
  `src/screens/ShopScreen.tsx:127`.
- `src/screens/cumulus_adapters/CardShopSiteScreenAdapter.tsx:73`, whose setup
  and cleanup share one effect.

All three call `mutations.setCardSourceDebug`, which maps through
`src/state/coop-journey-context.tsx:363` to `SET_CARD_SOURCE_DEBUG`. The reducer in
`src/rules/journey/shop.ts:656` applies every valid show and clear, including
same-value updates.

StrictMode runs the sequence publish, cleanup-to-null, publish. Runtime
generation, draft picks, shop purchases, and memo dependency changes can add
further publications. The effects contain no ownership or publication
generation guard.

`SET_CARD_SOURCE_DEBUG` is neither CAS-exempt nor decision-neutral. These
presentation-only writes can therefore bounce an unrelated partner intent.
They can also make the shared provenance overlay flicker.

`logs/journey-log.jsonl:35540`, `:35543`, `:35545`, and `:35547` show four applied
debug writes surrounding one `OPEN_SITE`. The full log sample contains 299
adjacent same-actor applied/applied pairs.

Recommended direction:

- Prefer client-local card-source provenance state.
- If the state remains shared, give each publication an ownership generation
  and let cleanup clear only the publication it owns.
- Add StrictMode tests for all affected variants and a replacement-screen test
  proving that an old cleanup cannot clear a newer publication.

### High: per-client effects own automatic shared game transitions

Several automatic transitions use a local ref or timer as the only submission
guard. Such guards survive a StrictMode replay inside one mounted component but
are independent for every connected client and reset on remount.

#### Dreamwell reveal and round-one phase advance

- `src/battle/components/PlayableBattleScreen.tsx:398` submits
  `DRAW_DREAMWELL_CARD` once per local `(side, turn)` ref.
- `src/battle/components/PlayableBattleScreen.tsx:436` submits `SET_PHASE` once
  per local `(side, turn)` ref.

Every connected client may submit the same automatic command. Concurrent
actors produce one applied event and one `partner_conflict` bounce. After a
same-client remount, `DRAW_DREAMWELL_CARD` returns the original board at
`src/rules/battle/apply-debug-edit.ts:1626`, and duplicate `SET_PHASE` returns
the original board at `src/rules/battle/apply-debug-edit.ts:362`; their enclosing
battle events still apply.

The normal single-client sequence appears in `logs/journey-log.jsonl:44507`
through `:44512`. The current log sample has no two-client duplicate for these
commands.

#### Cumulus draft completion

`src/screens/cumulus_adapters/DraftSiteScreenAdapter.tsx:66` automatically
submits one `COMPLETE_SITE` intent when the draft becomes complete. The intent
uses a run-scoped logical key, so connected clients converge on one durable
submission.

`COMPLETE_SITE` validates the matching site screen, active-site identity, and
visit eligibility in `src/rules/journey/sites.ts`. One applied fold marks both
site representations visited, clears the active site, and routes to the
dreamscape. A stale completion bounces without changing state.

#### Legacy Essence completion

`src/screens/EssenceSiteScreen.tsx:75` schedules automatic completion and
`src/screens/EssenceSiteScreen.tsx:23` submits `ACCEPT_ESSENCE`. Timer cleanup
handles a StrictMode replay within one component, but both clients schedule the
same automatic acceptance. The first applies and the second bounces at the
already-accepted guard in `src/rules/journey/sites.ts:428`.

The current log contains a single-client acceptance at
`logs/journey-log.jsonl:41733`.

Recommended direction for all automatic transitions:

- Express automatic transitions in the reducer/event-log progression, or elect
  one durable writer through shared state.
- Do not make a local React ref authoritative for a transition both players
  must agree on.
- Add two-client tests that release each automatic condition simultaneously and
  assert one logical transition with no own-action bounce.
- Add remount coverage after the first transition confirms.

### Medium: site bootstrap effects intentionally append applied no-ops

Draft entry effects:

- `src/screens/cumulus_adapters/DraftSiteScreenAdapter.tsx`

`OPEN_SITE` effects:

- `src/screens/cumulus_adapters/DreamsignRevelationScreenAdapter.tsx`
- `src/screens/cumulus_adapters/DuplicationSiteScreenAdapter.tsx`
- `src/screens/cumulus_adapters/CardShopSiteScreenAdapter.tsx`
- `src/screens/cumulus_adapters/DreamsignBazaarSiteScreenAdapter.tsx`
- `src/screens/cumulus_adapters/TransfigurationSiteScreenAdapter.tsx`

When the rendered snapshot has no site runtime or does not yet identify the
active draft site, both StrictMode setups observe the same pre-action snapshot
and submit. Dependency churn or remounting before confirmation can repeat the
same intent.

Duplicate `OPEN_SITE` returns the same journey at
`src/rules/journey/sites.ts:310`. Duplicate `ENTER_DRAFT_SITE` returns the same
journey at `src/rules/journey/draft.ts:221`. `journeyCase` in
`src/rules/reducer.ts:365` records both as applied.

The log contains eight adjacent `ENTER_DRAFT_SITE` applied/applied same-hash
pairs, including `logs/journey-log.jsonl:44192` and `:44195`, and six adjacent
`OPEN_SITE` pairs, including `logs/journey-log.jsonl:44246` and `:44248`.

`OPEN_SITE` and `ENTER_DRAFT_SITE` are CAS-exempt but are not decision-neutral
in `src/rules/events.ts:154`. A no-change duplicate still counts as an
intervening partner event and can bounce unrelated work.

The Reward test at `src/screens/reward-screen.test.tsx:360` uses a normal root
and explicitly expects a second runtime request after a rerender. None of these
bootstrap paths has a StrictMode regression test.

Recommended direction:

- Append site entry as part of navigation using a stable logical visit id.
- Centralize runtime bootstrap rather than tying it to screen mounting.
- Treating verified no-change entry events as decision-neutral can mitigate CAS
  fallout, but should accompany submission deduplication rather than replace it.
- Add StrictMode tests for one representative `OPEN_SITE` path and both draft
  variants, plus a two-client CAS regression.

### Medium: presence cleanup can resurrect a departed client

`src/coop/RoomGate.tsx:272` starts the presence writer implemented in
`src/eventlog/room.ts:286`. When `.info/connected` becomes true, the writer
starts `onDisconnect(entryRef).remove()` and unconditionally chains
`set(entryRef, entry)` at `src/eventlog/room.ts:308`.

Cleanup marks the writer disposed and writes `null` at
`src/eventlog/room.ts:314`, but the pending success continuation does not check
`disposed` again. A room change or unmount can therefore run in this order:

1. The on-disconnect registration remains pending.
2. Cleanup writes `null` to the old room.
3. The registration resolves.
4. The disposed writer restores `{ connected: true }` in the old room.

Presence bypasses the coop event log and reducer, so this issue has no
`coop_event` signature. Its visible effects are an incorrect connected count,
stale connected UI, delayed room eviction, and AI remaining disabled because
`src/battle/ai/ai-may-run-here.ts:44` requires a known count of at most one.

`src/coop/RoomGate.test.tsx:33` mocks `writePresence` as a resolved promise, so
the test does not exercise the real cleanup function.

Recommended direction:

- Re-check `disposed` after `onDisconnect().remove()` resolves and before the
  connected write, or serialize writer ownership with a generation token.
- Add a deferred-promise test that cleans up before registration resolves and
  asserts that no connected write follows.
- Repeat the writer test under StrictMode setup-cleanup-setup.

## Investigated high-risk effects that are safe

- `src/components/BattleSiteRoute.tsx:74` uses one `beginRequestedKeyRef` with
  no sibling reset. `src/components/BattleSiteRoute.test.tsx:321` verifies one
  `BEGIN_BATTLE` append under StrictMode.
- The Dream Augury card-source publishers in `src/components/ScreenRouter.tsx:502`
  and `src/screens/cumulus_adapters/DreamAugurySiteScreenAdapter.tsx:48` use
  signature guards and deferred generation-aware cleanup. The StrictMode test
  is `src/components/ScreenRouter.test.tsx:610`.
- `src/battle/ai/use-battle-ai.ts:253` retains its per-turn blocking ref through
  replay, replans against optimistic board state, and is disabled when presence
  reports multiple or unknown clients.
- `src/cumulus/screens/DreamscapeScreen.tsx:89` cancels the replayed Essence
  animation timer, retains its completion ref, and rechecks the durable
  `runtime.accepted` flag before dispatch.
- `src/coop/hooks.ts:176` captures and clears the pre-baseline append queue
  before submission, so one queued draft cannot flush twice.
- Production `useLayoutEffect` sites perform DOM measurement, focus, overlay
  positioning, or editor sizing. They do not append game events or write
  Firebase state.
- The `?goto=` bootstrap in `src/App.tsx:123` combines a replay-surviving ref
  with the durable `dreamAvatar` check.
- The asynchronous `?loadJourney=` path has no cancellation, but the codebase has
  no same-room keyed/remount path and the log contains no duplicate
  `LOAD_STATE`, so it is not a confirmed issue in this audit.

## Existing StrictMode coverage

The relevant test suite contains two StrictMode regression cases:

- `src/components/BattleSiteRoute.test.tsx:321`
- `src/components/ScreenRouter.test.tsx:610`

Tests that call `createRoot` without wrapping the target in `<StrictMode>` do
not cover effect setup-cleanup-setup replay.

## Prompt for the implementation agent

Copy the following prompt into a new task for the agent that will implement the
fixes:

```text
Fix every confirmed issue in docs/journey_prototype/react_effect_coop_audit.md.

Read the repository AGENTS.md first and follow it exactly. Work in the required
isolated worktree, run scripts/regenerate-assets.sh after creating it, commit
with a detailed message, and push immediately after committing. Do not work on
master unless explicitly instructed.

Treat the audit as evidence and requirements, not as a mandate to apply its
suggested implementation literally. Re-trace each path against the current
tree before editing. Preserve the core coop invariant: shared game state is a
fold of the room event log, clients append intent events only through
src/coop/actions.ts, and local React state or refs must not decide shared game
flow.

Implement and verify all of these outcomes:

1. Opening or widening BattleForeseeOverlay submits one logical reveal under
   React StrictMode, remounting, and two-client prompt display. A duplicate
   reveal must not become an applied no-op event or a partner-conflict toast.
2. Draft and shop card-source provenance does not emit a StrictMode
   show/clear/show sequence. A stale cleanup cannot clear another mounted
   surface's publication. Prefer client-local state if the overlay is local UI.
3. Dreamwell reveal, round-one phase advance, Cumulus draft completion, and
   legacy Essence completion have one durable owner in coop. Two clients
   observing the same automatic condition must produce one logical transition
   and neither client should receive an own-action bounce.
4. Site runtime bootstrap and draft entry append once per logical site visit.
   StrictMode replay, harmless rerenders, remounts, and multiple connected
   clients must not add applied same-state OPEN_SITE or ENTER_DRAFT_SITE events.
5. Presence cleanup cannot be followed by a stale asynchronous writer restoring
   the old room's connected entry.

Use test-driven development. Add focused regression tests before or alongside
each fix. A normal createRoot test is insufficient for StrictMode behavior:
wrap the relevant component tree in <StrictMode> and assert append counts and
event outcomes. Add deterministic two-client event-log tests for automatic
coop transitions and CAS behavior. Add remount tests where the audit identifies
ref lifetime problems. Do not make tests depend on current production TOML
values or default algorithm choices.

For every changed automatic flow, ensure the production logs still contain
enough identifiers and outcome data to reconstruct what happened in one game.
Use UUIDs for cards and other card identity comparisons; never use card names as
keys or equality identifiers.

Re-run the log analysis after the fixes. Demonstrate that the old signatures
are absent in new focused runs:

- adjacent same-actor BATTLE_COMMAND reveals from one Foresee mount;
- card-source show/clear/show on StrictMode replay;
- automatic two-client applied/bounced pairs;
- applied/applied same-hash OPEN_SITE or ENTER_DRAFT_SITE for one visit;
- a presence entry restored after its writer was disposed.

Run the full required verification from the worktree root:

npm run lint
npm run typecheck
npm test

Because these changes affect journey UI lifecycle and coop behavior, also perform
browser QA through the normal player workflow with two isolated browser
sessions against a non-default Vite port. Assert the URL and viewport before
screenshots, inspect the captured error buffer, and tear down only your own
server and browser sessions. Cover at least a site runtime bootstrap, a Cumulus
draft completion, an Essence completion, and a battle flow that reaches the
Dreamwell and Foresee behavior.

Before handing off, report each audit finding as fixed or still blocked, cite
the exact tests that prove it, and call out any recommendation you deliberately
implemented differently with the reason. If you encounter an unrelated
pre-existing problem, record it in pre-existing-issues.txt and include that
file in the commit.
```
