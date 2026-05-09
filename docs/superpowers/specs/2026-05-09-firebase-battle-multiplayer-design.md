# Firebase Battle Multiplayer Design

## Purpose

Battles in the V2 multiplayer prototype run as cooperative co-pilot sessions
through Firebase Realtime Database. Both connected players observe a single
shared battle and can issue any battle command — play card, move card, debug
edit, force result, end turn, undo, redo, reset — with the resulting state and
animation echoed back to both browsers.

The connected players do not represent battle sides. The battle still has a
single `player` side and a single `enemy` side; the two human clients share
control of the `player` side and observe the AI-driven `enemy` side together.

This work extends the V2 quest multiplayer architecture
(`docs/superpowers/specs/2026-05-08-firebase-multiplayer-v2-design.md`) with a
new `battleState` slot on each room. Battle reuses the existing room,
presence, and action-log boundaries; it does not introduce new rooms or new
authentication.

## Goals

- Persist a battle's full reducer state (mutable, history past/future, last
  transition) into the room so either client can drive any command.
- Use the existing pure `battleReducer` inside Firebase transactions so
  concurrent commands serialize through RTDB and converge to a single
  agreed-upon state.
- Replicate undo/redo as a shared operation: either client can undo, both
  rewind together; the past/future stacks are part of the shared state.
- Race-safely commit the per-battle `BattleInit` (deck order, seed, reward
  options, enemy descriptor, dreamcaller summary, atlas snapshot) so both
  clients see the same opening conditions even if URL parameters or local
  caches differ.
- Keep ephemeral UI state (selection, hover, drag, every overlay, judgment
  pause, result-overlay dismiss state, inspector tab) local per client.
- Append one action-log entry per battle command using the existing room
  `actionLog` and prune cap.
- Wipe `battleState` after a victory hand-off completes and after a failure
  route runs, so the slot stays null between battles.

## Non-Goals

- Per-side ownership, private hands, turn ownership, or seat assignment for
  the two clients. Both have equal control over the shared `player` side.
- Authoritative-server validation; the prototype's permissive RTDB rules
  apply.
- Optimistic local application with later reconciliation; clients render only
  what RTDB echoes back.
- Cross-battle history (a single room holds at most one battle slot at a
  time).
- Solo-mode `useBattleController` removal; the hook stays for unit tests, but
  production rendering goes through the multiplayer hook.

## Architecture

The battle module already separates pure reducer logic from React. This
design preserves that boundary and inserts a Firebase-backed transport
between the reducer and the UI.

The runtime stack at battle time becomes:

- **Pure core (unchanged):** `battleReducer`, `battleControllerReducer`,
  history helpers, engine modules, AI driver, and apply-debug-edit. These
  functions take a `BattleReducerState` and an action and return the next
  `BattleReducerState`. They run on each client.
- **Firebase transport (new):** A `multiplayer/battle` module exposes
  helpers to subscribe to `battleState`, run a battle command inside a room
  transaction, undo/redo, and reset. Each helper computes the next reducer
  state from the latest snapshot inside the transaction's updater so that
  concurrent commits compose without lost writes.
- **Battle context (new):** `state/multiplayer-battle-context.tsx` exposes
  `useMultiplayerBattle()`, returning `{ battleInit, reducerState, dispatch }`
  with the same shape `PlayableBattleScreen` already consumes from
  `useBattleController`. The context internally subscribes to `battleState`,
  reconstructs the reducer state on every snapshot, and wraps every dispatch
  in a Firebase transaction.
- **Site route (modified):** `BattleSiteRoute` reads battle init from the
  shared room. It calls a `useEnsureBattleSession()` helper that:
  - Reads the room's `battleState`.
  - If `null`, runs `createBattleInit` and `prepareInitialBattleState` from
    the live `questState` and commits both via the race-safe init
    transaction.
  - Otherwise, hands the existing init through.
  - Renders `PlayableBattleScreen` once init is available.
- **`PlayableBattleScreen` (modified):** Consumes
  `useMultiplayerBattle()` for `(reducerState, dispatch, battleInit)`. All
  other props and overlays stay local.
- **Quest provider integration:** `MultiplayerQuestProvider` gains a small
  surface for clearing `battleState` and adds `clear-on-quest-reset` to its
  reset path. The bulk of `multiplayer-quest-context.tsx` is untouched.

The `multiplayer/battle` module mirrors how `multiplayer/room-service` works:
small, focused, framework-free helpers; the React context is the only React
surface.

## Module Layout

```text
src/multiplayer/
  battle-paths.ts          # battleStatePath(roomId), battleStateInitPath, …
  battle-types.ts          # SharedBattleState, SerializedBattleHistory,
                           # SharedBattleReducerSlice, schema constants
  battle-service.ts        # ensureBattleSession, applyBattleCommandToRoom,
                           # undoBattleInRoom, redoBattleInRoom,
                           # resetBattleInRoom, clearBattleStateInRoom,
                           # serialization helpers
src/state/
  multiplayer-battle-context.tsx   # provider + useMultiplayerBattle hook
src/components/
  BattleSiteRoute.tsx              # rewritten to gate on shared init
src/battle/components/
  PlayableBattleScreen.tsx         # consumes useMultiplayerBattle()
src/battle/state/
  use-ai-turn-driver.ts            # unchanged (RUN_AI_TURN dispatch goes
                                    # through the multiplayer dispatch)
```

## Room Schema

The room schema gains a sibling `battleState` slot at the room root, alongside
`questState`, `presence`, and `actionLog`. `ROOM_SCHEMA_VERSION` bumps from
`1` to `2`.

```text
rooms/<roomId>
  metadata
    schemaVersion        # 2 once a battle slot is supported
    createdAt
    updatedAt
  questState             # unchanged
  presence               # unchanged
  actionLog              # unchanged; battle commands appended here too
  battleState            # null between battles
    init                 # frozen BattleInit, written once per battle
    reducer
      mutable            # BattleMutableState
      history
        past             # BattleHistoryEntry[]
        future           # BattleHistoryEntry[]
      lastTransition     # BattleReducerTransition | null
      commandSerial      # monotonic integer; bumps on every committed
                         # transition (init, command, undo, redo, reset)
```

`battleState` is `null` (or the field absent — RTDB elides null fields) when
no battle is active. The presence of `battleState.init` is the canonical
signal that a battle is running. `commandSerial` starts at `0` on init and
increments with every committed update so clients can detect newly applied
transitions for animation, logging, and effect dedup.

## Serialization Concerns

Realtime Database has well-known shape quirks the V2 quest implementation
already handles via `normalizeRoomSnapshot` in `room-service.ts`:

- Empty arrays and empty objects are dropped on write and come back missing.
- Object keys come back in alphabetical order.
- `undefined` values are silently dropped.

Battle state must round-trip through these constraints without losing
fidelity. Concrete consequences:

- `BattleHistory.past` and `BattleHistory.future` are arrays that may legally
  be empty (a freshly-initialized battle has empty `past`; a battle with no
  redo has empty `future`). On read, normalization fills in `[]` defaults.
- `BattleSideMutableState.deck`, `hand`, `void`, and `banished` may all be
  empty arrays. Same defaulting on read.
- `BattleSideMutableState.reserve` and `deployed` are records keyed by slot
  id. Empty slot values are stored as `null`. `null` is preserved by RTDB,
  but if every slot in a side is null the parent object may be elided —
  normalization rebuilds the full slot record with `null` fills for each
  declared slot id.
- `BattleCardInstance.notes` and `tides` may be empty arrays.
- `BattleReducerTransition.steps` / `energyChanges` / `scoreChanges` /
  `aiChoices` / `logEvents` are all arrays that may be empty.
- Nested `Object.freeze` on read happens only for `init` (which we treat as
  immutable per battle); the `reducer` slice is mutable through dispatch.
- `BattleHistoryEntryMetadata.payload` and `undoPayload` are optional and
  RTDB-may-elide; they round-trip through `null` defaults.

A new `multiplayer/battle-service.ts#normalizeBattleStateSnapshot` does the
same job as `normalizeRoomSnapshot` does for quest state today. It is the
only place that knows the shape quirks; tests live alongside it and exercise
each empty-array, missing-record, and key-order case.

For history entries, `before` and `after` snapshots both contain a full
`BattleMutableState` plus `lastTransition`. To stay within reasonable RTDB
write sizes, the normalizer must run quickly, but no further compression or
delta encoding is introduced at this stage; prototype battles are short
enough that whole-snapshot history is acceptable.

## Reducer-In-Transaction Model

Every shared battle write goes through a Firebase transaction at
`rooms/<roomId>/battleState`. The transaction's updater is a small adapter
that:

1. Receives the latest serialized `battleState` from RTDB.
2. Returns `undefined` (transaction abort) if the snapshot is `null` or has
   no `init` (battle ended between dispatch and apply).
3. Normalizes the snapshot into a live `BattleReducerState` (with local
   `transitionId: 0`, `activityId: 0` — these counters are not shared).
4. Applies the requested operation by calling the appropriate pure function:
   - `APPLY_COMMAND`: `battleControllerReducer(state, action, init)` →
     internally invokes `applyBattleCommand` → `battleReducer`.
   - `UNDO`: `undoBattleHistory` then update the in-memory reducer state
     fields the same way `applyHistoryStateChange` does locally.
   - `REDO`: symmetric to undo.
   - `RESET`: replace `mutable` with `prepareInitialBattleState` over a fresh
     `createInitialBattleState(init)` and clear `history`.
5. Bumps `commandSerial` by `1`.
6. Builds and merges an `actionLog` entry inside the same transaction.
7. Updates `metadata.updatedAt`.

The transaction commit is the only authoritative event. Local React state
updates only when the subscription emits a new snapshot; there is no
optimistic local apply.

Each transaction sees the live RTDB state, so concurrent commits compose
correctly: the second commit's updater runs against the post-first-commit
state and applies its operation on top.

### Sources of Non-Determinism

The pure reducer is deterministic given `(state, action, init)`. Battles
also use seeded RNG streams derived from `init.seed`. Because `init` is
shared and the reducer is pure, both clients (and the transaction updater)
produce identical results from identical inputs. The only place
non-determinism could enter is through new `Math.random()` calls; the
existing engine code already routes randomness through `BattleInit.seed`-
derived streams, and any new code added during this migration must do the
same.

`BattleHistoryEntryMetadata.timestamp` and `commandId` are generated at
dispatch time on the client that initiated the command. The transaction
treats them as part of the action payload, so all observers see the same
metadata. Client-side metadata generation does not need to be deterministic
across clients — only the originating client supplies it for that command.

## Battle Init (Race-Safe Transaction)

When `BattleSiteRoute` mounts and observes `battleState === null` while the
quest screen is `{ type: "battle" }` (or however the quest currently selects
a battle site), it kicks off `ensureBattleSession`:

```text
ensureBattleSession(database, roomId, sessionInputs):
  computedInit = createBattleInit(sessionInputs)
  computedInitial = prepareInitialBattleState(
    createInitialBattleState(computedInit),
    computedInit,
  ).state

  runTransaction(rooms/<roomId>/battleState):
    current => current?.init !== undefined
      ? current               # someone else already initialized
      : {
          init: computedInit,
          reducer: {
            mutable: computedInitial,
            history: { past: [], future: [] },
            lastTransition: null,
            commandSerial: 0,
          },
        }
```

Every losing client retains its locally-computed `init` only for
`useEnsureBattleSession`'s in-flight value; once the subscription delivers
the winning snapshot, the loser's local copy is discarded.

If both clients have different URL parameters (`?enableAi=1`, `?seed=…`),
the first commit wins and the loser's would-be init is dropped. Subsequent
commands run against the winning init. This eliminates the V1 risk of
silent drift between two browsers' battle decks.

`createBattleInit` requires the live quest state (deck, dreamsigns,
dreamcaller, atlas, completionLevel, currentDreamscape, resolvedPackage).
The `useEnsureBattleSession` hook reads these from `useQuest()` (the
multiplayer-backed quest context). Both clients see the same quest state
through the existing subscription, so any client could win the init race
and produce equivalent inits.

`atlasSnapshot` is captured at init time so the post-victory atlas update
runs against the atlas the battle was generated against, even if a remote
quest mutation has changed `state.atlas` mid-battle.

## Shared History And Undo/Redo

The full `past` and `future` arrays live in `battleState.reducer.history`.
Either client can dispatch undo or redo; the transaction reads the latest
history, applies the move, and writes back the new past/future and the
restored mutable.

History entries already carry full `BattleHistorySnapshot` before/after
state plus metadata. The serialized form on RTDB is the same shape as the
in-memory form, modulo the array-elision quirks documented in
**Serialization Concerns**.

Local effects that historically dedup'd by `transitionId` / `activityId`
switch to dedup'ing by `commandSerial`. The dedup ref tracks the last-
observed `commandSerial`; on every snapshot whose serial differs from the
ref, the effect emits its log events and any one-shot UI hooks fire (e.g.
judgment-pause overlay).

`commandSerial` is also recorded on each history entry's metadata so a
later redo replays the same serial bump pattern; clients use the entry's
`metadata.commandId` to resolve "is this the entry I just dispatched?" when
a fresh dispatch and an undo land in the same window.

## Local UI State

Every overlay, hover preview, drag indicator, selection, inspector tab,
result-overlay-dismissed state, judgment-pause animation hook, deck-order
picker, foresee overlay, figment creator, note editor, side-summary
popover, dreamcaller panel, reward-overlay locked flag, turn banner, and
log drawer remains a `useState` inside `PlayableBattleScreen` or its
descendants. Nothing under the `battleState` slot in RTDB describes UI
visibility.

The reward overlay is a partial exception. The reward *commit* is shared:
it calls quest mutations that propagate to the room. The overlay's open
state and selected-but-not-confirmed index stay local. Either client may
press confirm; the existing idempotency in
`completeBattleSiteVictory` (the `completedBattleIds` set keyed by
`battleId`) ensures only the first commit applies.

The judgment-pause overlay opens for each client independently when that
client first observes the judgment transition (the `commandSerial` for the
END_TURN composite changed, and `lastTransition.judgment !== null`). Each
client dismisses for itself.

## Reset Battle

`PlayableBattleScreen.handleResetBattle` currently dispatches `UNDO` N
times. In multiplayer that would mean N transactions and N RTDB writes for
one user gesture. The new flow becomes a single `RESET_BATTLE` operation:

- Build the reset target state with `prepareInitialBattleState(
  createInitialBattleState(init), init).state`.
- Run a transaction that writes `mutable = resetTarget`,
  `history = { past: [], future: [] }`, `lastTransition = null`, bumps
  `commandSerial`, and appends an action-log entry of action
  `"battle:reset"`.

The local UI also clears local-only state (selection, overlays, etc.)
during reset; the dispatch path is a single shared `RESET_BATTLE` rather
than a sequence of undos.

## Lifecycle

A battle has four lifecycle states observable in the room:

1. **No battle active.** `battleState` is `null` (or absent). Quest screen
   may be on atlas, dreamscape, or any other site type.
2. **Battle running.** `battleState.init` exists; `battleState.reducer`
   tracks live state. `result` may transiently be `null`.
3. **Battle resolved, post-game in progress.** `battleState.reducer.mutable.
   result !== null`. The reward overlay (on victory) or failure route (on
   defeat/draw) is in flight on at least one client.
4. **Hand-off complete.** Quest mutations have applied (rewards or failure
   route). `battleState` is wiped to `null` by a final clear transaction.

Concrete clear hooks:

- **Victory clear.** `completeBattleSiteVictory` runs from
  `BattleRewardSurface`'s confirm. After the existing idempotent quest
  mutations apply (and after the post-victory atlas hand-off), a new
  `clearBattleStateInRoom` transaction sets `battleState` to `null`.
  Idempotent: subsequent clears no-op.
- **Failure clear.** `beginQuestFailureRoute` already sets
  `failureSummary` and screen via quest mutations. Append a
  `clearBattleStateInRoom` call after the route call so the slot is empty
  before `QuestFailedScreen` triggers `resetQuest`.
- **Quest reset clear.** `MultiplayerQuestProvider.resetQuest` is the
  existing point of truth for blowing away a run. Add `battleState` to the
  paths it nulls so a reset issued during a battle leaves a clean room.

The clear transaction writes `null` at `battleState` and bumps
`metadata.updatedAt`. A clear that runs while another client is mid-
dispatch is harmless: that other client's updater sees `current === null`
and aborts.

## AI Turn Handling

The existing reducer folds the enemy's AI turn into the same composite as
the player's `END_TURN`. With reducer-in-transaction, this stays the same:
the transaction's updater runs the full composite pure-functionally, and
the resulting state plus history entry land atomically in one RTDB write.

`useAiTurnDriver` continues to fire its single bootstrap `RUN_AI_TURN`
dispatch when the initial mutable starts with `enemy` on `main` and an
empty history. In multiplayer, "history is empty" is a property of the
shared reducer slice, observable through subscription. The driver uses a
local `hasDrainedRef` so it dispatches at most once per `PlayableBattleScreen`
mount; if both clients mount on the same opening state they may both
dispatch, but only the first transaction succeeds — the second's updater
sees `history.past.length > 0` and aborts (matching the existing
controller-level guard in `controller.ts`).

`enableAi` lives on `BattleInit`, which is shared. The initiating client's
URL parameter wins through the init transaction; both clients then observe
the same AI behavior.

## Action Log Integration

Each battle command commit appends one action-log entry to the existing
shared `actionLog` map under `rooms/<roomId>`. Entries use the shared
`ActionLogEntry` shape with:

- `action`: `"battle:PLAY_CARD"`, `"battle:MOVE_CARD"`, `"battle:DEBUG_EDIT"`,
  `"battle:END_TURN"`, `"battle:FORCE_RESULT"`, `"battle:UNDO"`,
  `"battle:REDO"`, `"battle:RESET"`, or `"battle:INIT"` for the init
  commit.
- `source`: the `sourceSurface` from the command metadata (e.g.
  `"hand-tray"`, `"battlefield"`, `"inspector"`).
- `summary`: a compact record — `commandSerial`, `commandId`,
  `battleCardId` when applicable, `targetSlotId` when applicable, and
  `commandKind` for `DEBUG_EDIT`.

The 50-entry cap and `pruneRoomActionLog` prune transaction continue to
apply. Battle commands and quest mutations share the same action-log
budget; under heavy battle play the log will skew battle-heavy. That is
acceptable for prototype diagnostics.

## Concurrency And Write Semantics

All shared battle writes go through `runTransaction(battleState)`. The
existing `enqueueRoomWrite` queue in `room-service.ts` already serializes
all room-scoped writes per `roomId`; battle dispatches use the same queue
so quest writes and battle writes interleave deterministically on a single
client.

Inter-client serialization happens at the RTDB transaction layer. Two
clients each running their own queues can still race, but each transaction
re-runs against the latest snapshot until commit succeeds, so concurrent
PLAY_CARD plus MOVE_CARD applies both in some order.

Last-write-wins is unacceptable for battle commands because the reducer's
output depends on the exact prior state (e.g. UNDO-after-PLAY would clobber
a remote MOVE if the writer used path updates). Transactions are required
for every operation listed in **Reducer-In-Transaction Model**.

The init transaction is also required: two clients independently committing
different `init` objects would corrupt the slot. The existence check on
`current?.init !== undefined` makes init idempotent.

## Error Handling And UX

The existing room-loading flow (loading state, missing-room state,
permission errors) covers battle entry — `battleState` is just another
slot under the room. Specific battle-side cases:

- **Quest screen says battle, but `battleState` is still loading.**
  `BattleSiteRoute` renders a small loading state while
  `useEnsureBattleSession` completes its first transaction. This should
  resolve in one round-trip.
- **Init transaction failure.** Surface the underlying RTDB error
  message in a compact battle-init error panel with a retry button. Retry
  re-runs `ensureBattleSession`.
- **Command transaction failure.** Log the error and leave the local UI
  unchanged; subscription will continue to reflect the canonical state.
  No optimistic apply means there is no local rollback to perform.
- **Battle slot becomes null mid-screen.** A clear from another client
  (or a quest reset) drops the slot. `PlayableBattleScreen` unmounts
  cleanly because `BattleSiteRoute` sees the missing slot and stops
  rendering the screen; the quest screen state should already have moved
  off the battle site by the time a clear lands.

Disconnect/presence behavior is unchanged from V2. A disconnected client
keeps showing its last received battle snapshot until reconnected; no
local writes are queued offline.

## Testing

- **Pure reducer tests** stay unchanged.
- **Serialization tests** in `multiplayer/battle-service.test.ts` exercise
  every empty-array and missing-record case identified in
  **Serialization Concerns**, plus key reordering. The normalizer must be
  the single point of repair so a snapshot round-tripped through RTDB
  re-renders identically to the in-memory version.
- **Transaction-updater tests** exercise the reducer-in-transaction
  helpers (`applyBattleCommandToRoom`, `undoBattleInRoom`,
  `redoBattleInRoom`, `resetBattleInRoom`, `ensureBattleSession`) with a
  mock RTDB. Cover: command on null slot (abort), command on valid slot
  (apply, bump serial, append action log), undo on empty past (abort),
  redo on empty future (abort), reset (history cleared), init race (only
  first commit wins).
- **Context tests** for `useMultiplayerBattle()` mock the subscription and
  assert that the consumer receives `(reducerState, dispatch, init)` and
  that dispatch fans out to the expected transaction helper. Keep the
  existing `useBattleController` tests intact for solo coverage.
- **`PlayableBattleScreen` integration tests** swap in the new context
  with a fake dispatch and verify the screen renders correctly given a
  shared snapshot. The existing local-state tests (selection, overlays,
  hover) continue to pass unchanged.
- **Two-window manual QA** exercises:
  - Either client can enter the battle site first; both observe the same
    deck order and reward options.
  - Either client can play a card; the other client renders the same
    state and animation within a single round-trip.
  - Concurrent commands from both clients apply in some order without
    state corruption.
  - Either client can undo or redo; both rewind together.
  - Reset Battle from one client clears history for both.
  - Victory reward selected on one client clears the slot and routes
    both clients back to the atlas.
  - Failure route from one client surfaces the failed screen on both.
  - Quest reset during an active battle clears the slot for both.
  - Refreshing either browser mid-battle reloads the same shared state.
  - URL-parameter mismatches (`?enableAi=1` on one client, off on the
    other) produce identical battles because the init transaction's
    winner sets the value for both.

## Rollout Plan

1. Add `battle-paths.ts`, `battle-types.ts`, and `battle-service.ts` with
   serialization helpers and unit tests.
2. Bump `ROOM_SCHEMA_VERSION` to `2`. Update `createRoomRecord` to include
   the `battleState: null` slot so new rooms have the field.
3. Add the `multiplayer-battle-context.tsx` provider and
   `useMultiplayerBattle()` hook with mock-RTDB tests.
4. Rewrite `BattleSiteRoute` to use `useEnsureBattleSession()` and the new
   context.
5. Switch `PlayableBattleScreen` from `useBattleController` to
   `useMultiplayerBattle()`. Adjust effects to dedup by `commandSerial`.
6. Convert Reset Battle to a single shared `RESET_BATTLE` operation.
7. Wire `clearBattleStateInRoom` into the victory hand-off, the failure
   route, and `MultiplayerQuestProvider.resetQuest`.
8. Add battle commands to the action log writer.
9. Run typecheck, full test suite, production build, and two-window manual
   QA.

## Acceptance Criteria

- A new room created with the V2 quest flow has `battleState: null` and
  `metadata.schemaVersion: 2`.
- Entering a battle site populates `battleState.init` and
  `battleState.reducer` exactly once, even if both clients enter at the
  same time.
- Either client can dispatch any battle command; the other client renders
  the same resulting state and animation within one RTDB round-trip.
- Either client can undo and redo; both clients' history stacks rewind
  together.
- Reset Battle issued from one client clears history and resets mutable
  state for both clients via a single RTDB write.
- Concurrent commands from both clients converge to a deterministic
  composed state without lost writes.
- All overlays, hover previews, selection, and dismiss state remain
  per-client.
- A victory hand-off applies quest rewards through the existing
  multiplayer quest mutations, then clears `battleState` so the slot is
  null when the atlas screen returns.
- A failure route writes the failure summary through the existing quest
  mutations, then clears `battleState` so the failed-screen reset starts
  with a clean room.
- A quest reset issued during an active battle clears both `questState`
  and `battleState`.
- Refreshing either browser mid-battle reloads the latest shared battle
  state.
- The action log contains one entry per committed battle command, with
  `action: "battle:<KIND>"` and a compact summary, capped at the existing
  50-entry limit.
