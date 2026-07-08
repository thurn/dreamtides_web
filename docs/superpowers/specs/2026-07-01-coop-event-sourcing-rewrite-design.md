# Coop Event-Sourcing Rewrite — Design Spec

Date: 2026-07-01
Status: approved design; implementation plan at
`docs/superpowers/plans/2026-07-01-coop-event-sourcing-rewrite.md`
Source proposal: `docs/quest_prototype/coop_event_sourcing_proposal.md`

## Goal

Rewrite the quest prototype's cooperative multiplayer structure as the
event-sourced "shared log, local fold" architecture from the proposal. The
result is equivalent to deleting all existing sync/orchestration code and
writing it from scratch: clients append intent events to a totally-ordered
shared log in Firebase RTDB; every client computes game state as a pure fold
of that log; all simulation lives inside the reducer. No legacy sync
machinery survives.

## Decisions fixed during brainstorming

1. **Big-bang cutover.** The new architecture lands as one replacement. No
   dual-mode room schema ever exists; old sync code is deleted as new code
   lands. All existing Firebase data may be deleted — the new schema starts
   on a clean database with no compatibility code.
2. **Pure rules logic relocates intact.** Everything architectural is
   rewritten from scratch: all of `src/multiplayer/`, both multiplayer
   contexts, both effect-runner hooks, the battle entry seam, presence
   consumers. Already-pure rules functions (`applyDebugEdit`, the card-effect
   script tables, `planNextEffectStep`, `applyPromptResolution`, the domain
   math inside the quest mutations) are relocated and re-plumbed into the
   reducer with their logic preserved.
3. **Undo is removed entirely.** No `UNDO` event, no checkpoint stack, no
   undo/redo UI. `src/battle/state/history.ts` and every consumer of it is
   deleted, along with the undo/redo controls in the battle screen.
4. **Rooms die on deploy.** `genesis.reducerVersion` pins a room to the build
   that created it. A client on a different build sees a read-only "new
   version deployed — start a new game" state. No cross-version migration.

## Non-goals

- Preserving any existing RTDB data, schema version, or in-flight room.
- Quest-level or battle-level undo.
- An authoritative server or Cloud Functions (excluded by the proposal's
  requirements).
- Generalizing the engine for other games or transports beyond what one
  clean reducer-parameterized module needs.

## Architecture

Three new packages with strict dependency direction
(`coop → eventlog, rules; rules → nothing impure`):

```
src/eventlog/            # game-agnostic log engine — no Dreamtides imports
  types.ts               # GameEvent, Genesis, LogNode, EngineConfig<S>, EventOutcome
  append.ts              # append transaction: head+1, write event, in-transaction compaction
  subscribe.ts           # onValue on log/, decode, ordered delivery
  fold.ts                # confirmed fold + optimistic echo + reconciliation
  rng.ts                 # pure per-event random stream keyed (seed, seq, drawIndex)
  hash.ts                # canonical state hash (divergence tripwire)
  room.ts                # room ids, room creation/eviction, presence

src/rules/               # the pure game reducer — importing Firebase or React here is a lint error
  events.ts              # discriminated union of every event type + payload types
  reducer.ts             # root fold: CAS guard → domain reducers → {state, outcome}
  fold-state.ts          # FoldState type + genesis-state constructor
  quest/                 # feature-grouped event cases (deck, shop, sites, draft, atlas, essence, lifecycle, modifiers)
  battle/                # BattleFoldState, event application, effect engine (queue/prompts/triggers)
                         # relocated: apply-debug-edit, script tables, step planner, dreamwell table

src/coop/                # thin React layer
  RoomGate.tsx           # create/join room, genesis write, presence, subscription, version gate
  hooks.ts               # useGameState(), useAppend(), useConnectedCount()
  actions.ts             # named action creators (same call ergonomics screens use today)
  BounceToast.tsx        # "your partner acted first — the board has changed"
  VersionGateScreen.tsx  # read-only new-version state
  EventLogViewer.tsx     # ?viewLogs= replacement reading the event log
```

The engine is parameterized by an `EngineConfig<S>`:

```ts
interface EngineConfig<S> {
  reducer: (state: S, event: GameEvent, ctx: EventContext) => { state: S; outcome: EventOutcome };
  genesisState: (genesis: Genesis) => S;
  encode: (s: S) => string;          // for baseSnapshot
  decode: (raw: string) => S;
  hash: (s: S) => string;
}
```

`EventOutcome` is `"applied" | "bounced"`. `EventContext` provides `seq`,
`rng(drawIndex)`, and
`intervening: Array<{ seq: number; actor: string; type: string }> | "unknown"`
— the events between `basedOnSeq` and this event's seq **that themselves
applied** (a bounced event changed nothing and can never invalidate a later
decision), or the literal `"unknown"` when `basedOnSeq < baseSeq`, so a
reducer can never mistake an empty window for an unknowable one. The engine
computes `intervening` from the live log, applying the applied-only filter
itself (it folds in seq order, so it knows every prior outcome); the
**policy** — self-chain exemption, prompt gating, CAS-exempt and
decision-neutral event types — lives entirely in the rules reducer, which
is why entries carry `type`.

## Data model

RTDB schema (schema starts clean; nothing else exists under a room):

```
rooms/{roomId}/
  log/
    genesis:      JSON string { seed, reducerVersion, createdAt }
    baseSeq:      number       # events ≤ baseSeq are compacted into baseSnapshot
    baseSnapshot: JSON string | null
    head:         number       # seq of newest event
    events:       { [seq]: JSON string }   # dense integer keys in (baseSeq, head]
  presence/       { clientId: { connected, lastSeenAt } }
  logs/           # quest-log sink (push-keyed JSONL strings), kept as today
```

**Events and snapshots are stored as JSON strings**, not RTDB trees. RTDB
strips empty arrays, `undefined`, and empty objects from trees; today that
requires ~250 lines of normalization (`battle-normalize.ts`, the
`normalizeQuestState` family) plus `stripUndefinedForRtdb`. Opaque strings
round-trip byte-exact, which also makes `stateHashAfter` comparisons stable.
None of the normalization/sanitization layer is carried over. The reducer
must still produce JSON-safe state (no functions, no `undefined` values in
arrays); a dev-mode encode/decode round-trip assertion enforces this.

```ts
interface GameEvent {
  type: string;                       // "BATTLE_COMMAND" | "BEGIN_BATTLE" | ...
  payload: Record<string, unknown>;   // UUIDs, choice indices — never card names
  actor: string;                      // clientId, or "ai:<clientId>" for AI-originated events
  clientTimestamp: string;            // display data only, stamped by appender
  basedOnSeq: number;                 // newest confirmed seq folded into the state the actor saw
  nonce?: string;                     // client-stamped; matches confirmed events against the
                                      // pending-intent queue; ignored by reducers
  stateHashAfter?: string;            // appender's local fold hash (see Safety rails)
}
```

```ts
interface FoldState {
  quest: QuestState;
  battle: BattleFoldState | null;
}
```

**`FoldState` must be pure data.** This is a hard constraint the proposal
implies but this spec makes explicit: `baseSnapshot` serializes it and the
tripwire hashes it, so it may not contain closures. Today's `EffectStep`
objects hold `build(ctx)` functions; the fold state instead stores a
**cursor** into the static script tables:

```ts
interface BattleFoldState {
  board: BattleMutableState;          // today's shape, relocated
  effectQueue: EffectRun[];           // pending automation runs, as data
  pendingPrompt: PendingPrompt | null;
}

interface EffectRun {
  scriptRef: { table: "battle" | "dreamwell"; id: string };  // key into static tables
  stepIndex: number;
  side: BattleSide;
  sourceInstanceId?: string;
}

interface PendingPrompt {
  promptId: number;                   // seq of the event that opened it
  run: EffectRun;                     // the paused run
  kind: "pick-cards" | "choice" | "confirm" | "foresee";
  options: unknown;                   // resolved candidates/labels, as plain data
}
```

The reducer resolves a cursor to live script steps via
`selectBattleCardEffectScript` / `selectDreamwellEffectScript` at fold time.
Scripts are code, referenced by id; state carries only ids and indices.

## The eventlog engine

### Append protocol

Exactly the proposal's transaction, on the whole `log/` node:

```ts
runTransaction(logRef, (log) => {
  log.head += 1;
  log.events[log.head] = encodeEvent(event);
  if (log.head - log.baseSeq > COMPACT_THRESHOLD) compactInPlace(log);
  return log;
});
```

- `COMPACT_THRESHOLD = 200` live events; compaction folds the oldest events
  into `baseSnapshot` (using the injected reducer + `genesisState`/`decode`),
  advances `baseSeq`, and deletes them — inside the same transaction, so it
  is atomic. Because the fold is pure, either client compacting produces
  identical bytes.
- RTDB retries losers automatically; with two humans contention is
  negligible. The per-room promise write-queue from the old layer is not
  carried over — the single-location transaction is the serialization.

### Read path and fold

`onValue` on `log/`. The engine keeps `(lastFoldedSeq, confirmedState)` and
folds new events incrementally. Full re-fold from `baseSnapshot` happens
after compaction advances past `lastFoldedSeq` or on reconnect. For each
event it computes `intervening` (actors of events in `(basedOnSeq, seq)`)
from the log; if `basedOnSeq < baseSeq` (an appender staler than the
snapshot horizon), `intervening` is reported as unknown and the rules
reducer bounces the event — conservative and safe.

The engine reports each event's outcome to the client layer
(`onEventOutcome(event, seq, outcome)`); the UI shows the bounce toast when
`event.actor` is this client and the outcome is `bounced`.

### Optimistic echo

On click, the client folds its own intent on top of `confirmedState` at a
*predicted* seq (`lastFoldedSeq + 1 + pendingCount`) and renders
immediately. Pending intents are kept in an ordered local queue. When
confirmed events arrive, the display state is recomputed as
`fold(confirmedState, pendingIntents)` — if a partner event won the race,
the CAS rule folds the local intent to a no-op during that recompute, the
echo visibly rolls back, and the toast explains why. There is no bespoke
rollback code; rollback is recomputation.

Because RNG is keyed by committed seq, an optimistic fold that predicted the
wrong seq can differ from the confirmed result (e.g. a different random
draw). This is acceptable: the echo is a preview, and reconciliation
replaces it with the confirmed fold within one round-trip.

### Randomness and time

- `rng.ts` implements the `merchantRng` SHA-256 salted-stream pattern from
  `src/journey_v2/signals/rng.ts`, keyed `(genesis.seed, seq, drawIndex)`.
  The reducer receives `ctx.rng` and passes it wherever `StepContext.random`
  goes today. `weightedSample` in `draft-engine.ts` takes an injected rng.
  No `Math.random()` may appear in `src/rules/` (lint-enforced).
- Game logic never reads the clock. Anything needing a timestamp (card
  notes) reads `event.clientTimestamp`. No `Date.now()` in `src/rules/`
  (lint-enforced).

### Room lifecycle

`room.ts` keeps today's behaviors with new code: 6-char room ids, `?game=`
URL param, create-with-stale-eviction (24h window), presence writes with
`onDisconnect` cleanup. `clientId` is minted fresh per tab/connection and
never persisted per browser: the self-chain CAS exemption assumes one
optimistic view per actor, which two tabs sharing an id would violate.
Room creation writes `genesis` (fresh random seed,
`reducerVersion` = build hash injected at build time via a Vite define) in
the same multi-path update that creates the log node.

## The rules reducer

### Root fold and CAS policy

```
reduce(state, event, ctx):
  1. if event.type is CAS-exempt → skip rules 2-4 (initial exempt set: card-note
     events and OPEN_SITE — see Quest events); rule 5 validation still applies
  2. if event is RESOLVE_PROMPT whose promptId matches the open prompt →
     skip rules 3-4 (see below)
  3. if ctx.intervening is unknown, or contains any event whose
     actor !== event.actor and whose type is not decision-neutral
     (initial decision-neutral set: card-note events) → bounce
  4. if state.battle?.pendingPrompt is set and event is not RESOLVE_PROMPT
     with matching promptId → bounce
  5. route to the domain reducer for event.type; invalid-in-current-state
     intents (buy with insufficient essence, play a card not in hand,
     RESOLVE_PROMPT with no matching open prompt) → bounce
  6. return { state', outcome: "applied" } or { state, outcome: "bounced" }
```

Rule 3 is the strict compare-and-swap with the self-chain exemption: a
player's own in-flight events never invalidate their later ones; any
**applied** partner event in the window bounces the intent. `ctx.intervening`
already excludes events that themselves bounced — a bounced event changed
nothing, and without that filter two players acting in a rapid overlapping
burst would bounce each other off events that were already no-ops.
Decision-neutral types (card notes) are additionally ignored by rule 3:
they carry no game-rules meaning, so a partner's note must never bounce an
unrelated intent. `OPEN_SITE`, by contrast, is exempt from *being* bounced
(rule 1) but **does** count as intervening — it generates site offers, so an
intent decided before folding a partner's `OPEN_SITE` must bounce.

Rule 2 is sound because a prompt's options are fixed at open: while the
prompt is open every non-exempt event bounces (rule 4), and no current
exempt type alters battle state, so nothing an intervening event could have
done changes what the resolution means. The losing racer still bounces —
once one resolution applies, the prompt is closed and the other falls
through to rule 5. Revisit this fast path if the exempt set ever grows a
battle-relevant type. Bounced events remain in the log as recorded no-ops.
The reducer never throws on any event content — malformed or stale intents
bounce; throwing is reserved for programmer errors caught in dev (and
contained in production, see Safety rails).

### Quest events

Every multiplayer mutation in `src/state/multiplayer-quest-context.tsx`
becomes an event type with a reducer case in `src/rules/quest/`, grouped by
feature (essence, lifecycle, dreamcaller, navigation, deck, transfiguration,
dreamsigns, draft, sites, merchant, shop, limits, atlas, modifiers, misc).
The implementation plan carries the authoritative 1:1 table from the
mutation catalogue produced during exploration; representative examples:

- `changeEssence` → `ADJUST_ESSENCE { delta }`
- `pickDraftCard` → `PICK_DRAFT_CARD { packIndex, cardId }`
- `buyShopSlot` → `BUY_SHOP_SLOT { siteId, slotIndex }`
- `startQuest` / `resetQuest` / `loadQuestState` / QA bootstraps →
  `START_QUEST`, `RESET_QUEST`, `LOAD_STATE { snapshot }` (debug-only, large
  payload is fine — compaction absorbs it)

The `ensure*SiteRuntime` family (five mutations) simplifies structurally:
those writes exist because generation used `Math.random()` and had to be
stored before rendering. In the new model a single `OPEN_SITE { siteId }`
event generates the site runtime **deterministically inside the reducer**
from `ctx.rng`, stores it in `state.quest.siteRuntime`, and both clients
compute identical offers. `OPEN_SITE` is CAS-exempt and idempotent: its
reducer case draws only from `ctx.rng` at its own seq and is a no-change
**applied** when the runtime already exists, so both players opening the
same site simultaneously converge without a bounce toast. Rerolls
(`rerollShop`, `rerollDreamAugury`) are events whose reducer case redraws
from the rng stream at their own seq.

The `NON_NULLABLE_RUN_FIELDS` invariant guard is deleted rather than ported:
no code path writes quest state, so there is no bad write to guard against.
Its spirit survives as reducer unit tests asserting no event sequence can
null `draftState`/`resolvedPackage`/`dreamcaller` mid-run.

### Battle events

- **`BEGIN_BATTLE { siteId }`** — constructs `BattleFoldState` from quest
  state deterministically (deck, dreamcaller, opponent deck drawn via
  `ctx.rng`). This replaces `ensureBattleSession`'s init race and the
  client-local `begunEntryKey`: "battle has begun" is a derivable fact of
  the log, so reload always lands on the correct screen. The pre-battle
  reveal screen renders when the site is active but no `BEGIN_BATTLE` has
  folded.
- **`BATTLE_COMMAND { command: BattleCommand }`** — the intent for every
  board interaction the UI performs today, carrying the existing
  `BattleCommand` union from `src/battle/debug/commands.ts`
  (`DEBUG_EDIT` wrapping a `BattleDebugEdit`, `FORCE_RESULT`,
  `SKIP_TO_REWARDS`). For edits the reducer applies `applyDebugEdit`, then —
  synchronously, still inside the same fold step — runs the automation that
  the effect-runner hooks perform reactively today:
  - **Materialized triggers**: if the edit moved a card into play, look up
    its script and either apply its edit steps or park an `EffectRun` /
    `PendingPrompt`. No board diffing: the reducer caused the change, so it
    knows the trigger fired.
  - **Dawn bookends**: on phase advance, apply deterministic dawn scripts
    and queue interactive ones.
  - **Dreamwell**: on a dreamwell reveal, queue the dreamwell script run.
  - **Support recompute**: run `planSupportRecompute` after any edit that
    changes support-relevant board shape, applying resulting edits in place.
  - The effect queue advances until it needs input (`pendingPrompt` set) or
    empties. Multi-run ordering (several cards materialized by one edit)
    is FIFO by instance id order, fixed and documented in code.
- **`RESOLVE_PROMPT { promptId, resolution }`** — applies
  `applyPromptResolution` for the paused run, then continues advancing the
  queue. First matching resolution applies; any other intent bounces while a
  prompt is open (root rule 4). All prompt-ownership machinery
  (`ownsRunRef`, `cancelPromptSignal`, prompt-internal `sourceSurface`
  exemptions) has no equivalent — either player resolves, both fold it.
- **`END_BATTLE { result }`** — folds victory/defeat into quest state
  (today's `incrementCompletionLevel` / `setFailureSummary` seam) and clears
  `state.battle`.
- **Card notes** (`SET_CARD_NOTE`) are CAS-exempt: no rules meaning, no
  decision context. (`OPEN_SITE` is the only other exempt type — see Quest
  events.)

The relocated pure pieces keep their tests and their logic:
`apply-debug-edit.ts`, `battle-card-effects-table.ts` (including the
hash-drift CI gate), `dreamwell-effects-table.ts`, `effect-runner-core.ts`.
What is written from scratch is the *driver*: the fold-time trigger firing
and queue advancement replacing both `use-*-effect-runner.ts` hooks.

### AI

Single-player keeps today's rule expressed in the new model: the AI runner
is enabled when `connectedCount <= 1` (a presence-derived, non-game fact)
and submits its moves as ordinary events with `actor: "ai:<clientId>"`
through the same append path. AI events CAS like any other actor's. If a
second client joins mid-battle, the AI stops appending; nothing else
changes. The AI's decision logic is preserved as-is; its integration is
re-plumbed to read fold state and emit events instead of dispatching
reducer commands.

## Client layer

- **`RoomGate.tsx`** — replaces `MultiplayerRoomGate.tsx`: parse `?game=`,
  create/join, write presence, subscribe, install the quest-log sink, and
  gate on `genesis.reducerVersion === BUILD_HASH`. Mismatch renders
  `VersionGateScreen` (read-only, "start a new game").
- **`hooks.ts`** — `useGameState()` returns the displayed fold
  (confirmed + optimistic); `useAppend()` builds events, stamping `actor`,
  `clientTimestamp`, and `basedOnSeq` = the newest *confirmed* seq folded
  into the displayed state (own pending intents are covered by the
  self-chain rule). `RESOLVE_PROMPT` is stamped with the promptId of the
  **confirmed** prompt: if the event that opened the prompt is still an
  optimistic echo, the resolve waits for its confirmation — a mispredicted
  seq would otherwise target a promptId that never comes to exist.
- **`actions.ts`** — named action creators mirroring today's
  `QuestMutations` call ergonomics (`actions.pickDraftCard(...)` appends
  `PICK_DRAFT_CARD`). Screens keep their call-site shape; only the provider
  they read from changes. This bounds the churn across the ~100 consumer
  components to import/provider swaps plus removal of undo controls.
- **Bounce UX** — optimistic echo applies instantly; a bounce visibly rolls
  back with a toast naming the cause ("your partner acted first"). Never
  silent.
- **Review rule** (enforced going forward, documented in AGENTS.md by the
  plan): React `useState`/`useRef` may never gate game flow; anything both
  players must agree on is a fold of the log.

## Logging and observability

- Every appended event is mirrored into the room's `logs/` sink and thence
  `quest-log.jsonl` (existing tooling keeps working), tagged with `gameId`,
  `seq`, `type`, `actor`, `outcome`, and `stateHashAfter` when present.
  **Single-writer rule**: each client mirrors only the events it appended
  (its own actor plus its `ai:` actor), tracked past a high-water seq so a
  refold after reconnect or compaction never re-mirrors. Every event has
  exactly one appender, so the union is complete with no duplicates.
  Divergence reports are the exception — any observing client logs those,
  stamped with its clientId. The AGENTS.md reconstruction standard is met
  structurally: the event log *is* the reconstruction.
- `fold_divergence` is logged loudly when a client's local hash disagrees
  with a peer's `stateHashAfter` at the same seq.
- Bounces are logged (`event_bounced` with intervening seqs) — bounce-rate
  is the health metric for the CAS policy.
- `EventLogViewer.tsx` replaces `RoomLogViewer.tsx` for `?viewLogs=`,
  showing the decoded event log plus the JSONL sink.

## Error handling and safety rails

- **Reducer versioning**: build hash in genesis; mismatch → read-only +
  reload prompt. Deploys end in-flight rooms by design.
- **Divergence tripwire**: appenders set `stateHashAfter` when their
  optimistic prediction matched the committed seq (the common case; skewed
  predictions omit it rather than write a wrong hash). Observers compare
  when present and log `fold_divergence` on mismatch. The log remains the
  truth: a nondeterminism bug desyncs a view, never the shared record; the
  recovery is re-fold.
- **Bounce on unknown**: stale-beyond-snapshot `basedOnSeq`, malformed
  payloads, and invalid-in-state intents all bounce rather than throw or
  partially apply.
- **Poison-event containment**: a reducer throw on a committed event would
  otherwise crash every client on every fold of that room forever — reload
  re-folds the same log. In production the engine wraps each reducer call:
  a throw is treated as a bounce and logged loudly (`fold_error` with seq
  and error); dev mode rethrows so programmer errors stay visible. If a
  throw is environment-dependent, clients diverge instead of crashing — the
  divergence tripwire reports it and the next compaction re-converges views.
  A degraded room beats a deterministic crash loop.
- **Malformed log entries**: an event string that fails to decode, or an
  event whose `basedOnSeq` is nonsensical (negative, or ≥ its own seq), is
  reported by the engine as a bounced no-op and logged; it never reaches
  the reducer and never throws.
- **The fold path is synchronous end to end**: reducer, `encode`/`decode`,
  `hash`, and `rng` must be synchronous functions, because compaction runs
  the fold inside `runTransaction`'s synchronous update callback (which may
  also retry — the pure updater makes retries harmless). Hashing uses the
  synchronous `js-sha256` dependency the `journey_v2` rng already uses;
  `crypto.subtle` is async and must not appear anywhere in the fold path.
- **Subscription loss**: on reconnect, full re-fold from `baseSnapshot`;
  pending optimistic intents are re-validated against the fresh confirmed
  state and dropped-with-toast if they bounce.
- **Dev-mode assertions**: encode/decode round-trip equality of `FoldState`
  after every fold step; fold determinism (`fold(fold-input)` twice hashes
  identically) in tests.

## Testing

- **Engine tests (toy reducer)**: CAS `intervening` computation (including
  that bounced events are excluded from later windows), self-chain
  scenarios, compaction equivalence
  (`fold(genesis, allEvents) === fold(decode(baseSnapshot), liveEvents)`),
  optimistic echo reconciliation and rollback, stale-appender bounce,
  poison-event containment (a throwing toy reducer yields a bounce and an
  error report, never an escaped throw), malformed-entry decode handling,
  seq-keyed rng stream stability.
- **Rules reducer tests**: relocated pure-piece suites continue unchanged
  (`apply-debug-edit`, script tables, step planner, hash-drift CI gate,
  support recompute, dawn triggers). The jsdom double-dispatch hook tests
  are replaced by pure fold tests: the "two clients race" scenarios become
  "two orderings of the same intents fold to a deterministic result" — data
  tests, no React. New suites: prompt lifecycle via events, trigger firing
  at edit-apply time, quest event cases per feature, run-field nullability
  properties, prompt-gating bounces.
- **Replay CI**: fixture logs (recorded from real sessions once the system
  runs, plus synthetic seeds) replayed in CI asserting the recorded final
  hash. Fixtures capture genesis + events; per AGENTS.md, fixtures assert on
  hashes and structure, never on TOML-sourced content that may change — a
  reducer or data change that invalidates fixtures regenerates them via a
  checked-in script.
- **Emulator integration**: two simulated clients appending concurrently
  against the RTDB emulator converge to identical hashes; compaction under
  concurrent appends; a seeded **chaos storm** — both clients firing long
  random bursts of valid, invalid, and stale intents concurrently — must
  converge to identical hashes with dense seqs and zero thrown errors.
  This is the direct encoding of the resilience goal: two players taking
  essentially random overlapping actions always land in one sane state.
- **Browser QA** per AGENTS.md: two-tab coop session on a non-5173 port —
  simultaneous actions produce one applied + one bounced with visible toast;
  reload mid-battle re-folds to the correct screen (the `begunEntryKey`
  regression); prompt raced by both players resolves once.

## Deletion inventory

Deleted outright (no successor keeps any of their code):

- `src/multiplayer/room-service.ts` (primary-client election, write queues,
  normalization family), `battle-service.ts` (`ensureBattleSession`,
  `commandSerial`, `EMPTY_SHARED_HISTORY`), `MultiplayerRoomGate.tsx`,
  `room-paths.ts`, `battle-paths.ts`, `room-types.ts`, `battle-types.ts`,
  `action-log.ts` (the event log is the action record),
  `rtdb-sanitize.ts`, `battle-normalize.ts`, `log-sink.ts` and
  `room-log-service.ts` (rewritten minimally inside `src/coop/` for the
  quest-log sink), `RoomLogViewer.tsx`, `room-id.ts` (regenerated in
  `eventlog/room.ts`).
- `src/state/multiplayer-quest-context.tsx` (all 5,051 lines),
  `multiplayer-battle-context.tsx` (`remoteCommandEpoch`, reconciliation),
  `use-ensure-battle-session.ts`, `quest-state-invariants.ts`.
- `src/battle/automation/use-battle-effect-runner.ts`,
  `use-dreamwell-effect-runner.ts`, their helper/diff functions and jsdom
  test suites.
- `src/battle/state/history.ts` (undo removed), undo/redo UI controls,
  `areBattleMutableStatesEqual` and history commit plumbing in the dispatch
  path.
- `begunEntryKey` and the local-state battle gate in `BattleSiteRoute.tsx`.

Relocated intact (new home, same logic):
`apply-debug-edit.ts`, `battle-card-effects-table.ts`,
`dreamwell-effects-table.ts`, `effect-runner-core.ts`,
`rules-text-hash.ts`, their test suites, and the seeded-rng pattern from
`journey_v2/signals/rng.ts` (generalized into `eventlog/rng.ts`).

Memory-file cleanup shipped with the rewrite: the stored guidance about
`writeRoomTransaction` invariants and the coop primary-client gate describes
deleted machinery and is retired when the rewrite lands.

## Risks and honest costs

- The fold-time effect driver (replacing ~1,050 lines of React
  orchestration) is the hardest single piece, prompt lifecycle in
  particular. Mitigation: the step planner and resolution functions are
  already pure and tested; the driver is new but small, and the replay
  harness reproduces any bug deterministically from a log.
- Strict CAS trades fluidity for the guarantee that an action never
  resolves against a state its player did not see; at two-player human
  rates bounces are rare and self-explaining.
- Reducer bugs hit both players identically — deterministically
  reproducible from the log rather than an unreproducible race.
- Big-bang delivery means no independently shippable intermediate — the
  branch is long-lived. Mitigation: the three packages are independently
  testable long before the cutover commit, and the plan sequences work so
  the engine and rules layers reach green tests before any UI is rewired.
