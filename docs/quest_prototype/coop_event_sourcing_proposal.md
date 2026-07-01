# Proposal: Event-Sourced Coop Sync ("Shared Log, Local Fold")

Status: proposal (2026-07-01). Motivated by the coop failures in demo room
`?game=7kwpat` and the broader class of double-simulation / primary-client bugs.

## The structural problem with the current architecture

Today, Firebase RTDB stores **materialized game state** (`questState`,
`battleState/reducer/mutable`), and clients write that state directly:

- Every battle command rewrites the full reducer slice inside an RTDB
  transaction (`src/multiplayer/battle-service.ts`).
- Rules-engine simulation runs as a **side effect of observing state**:
  `use-battle-effect-runner.ts` and `use-dreamwell-effect-runner.ts` are React
  hooks that diff the board on each render and dispatch follow-up writes.

This shape has an unavoidable consequence: any rule of the form "when X
happens, do Y" executes on *every* client that observes X. The two available
mitigations are both bug factories:

1. **Run it everywhere** → double-application (the Dreamwell index +2 bug).
2. **Gate on `isPrimaryClient`** → the effect silently doesn't run when the
   gate misjudges (presence lag, election flap), and the non-primary client's
   direct writes race the primary's automation (`remoteCommandEpoch`,
   `ownsRunRef`, prompt-ownership transfer — each a hand-rolled patch over the
   same root cause).

Separately, because shared state is only what someone remembered to write,
anything gated by client-local React state (e.g. `begunEntryKey` in
`BattleSiteRoute.tsx`) desyncs on reload: the shared record contains no fact
"this battle has begun."

These are not implementation bugs. They are properties of the model
**"clients write derived state; simulation reacts to state changes."** No
amount of convention fixes them.

## The proposal in one paragraph

Clients stop writing game state entirely. The only thing a client may write is
an **intent event** ("play card `uuid` targeting `uuid`", "begin battle",
"resolve prompt with choice 2") appended to a **totally-ordered shared log**
in RTDB. Game state is a **pure function of the log**: every client computes
`state = fold(reducer, genesis, events)` locally and identically. All
simulation — Dreamwell resolution, materialized triggers, dawn bookends,
support recompute — lives *inside* the reducer as deterministic consequences
of applying an event. Simulation output is never written anywhere, so it
cannot be written twice. There is no primary client, because no client does
anything another client doesn't also do.

This is classic event sourcing / deterministic lockstep, the standard model
for serverless multiplayer (RTS lockstep networking, Firebase turn-based
games). RTDB provides exactly the two primitives it needs: an atomic
compare-and-swap (`runTransaction`) for total ordering, and low-latency
fan-out (`onValue`) for delivery.

## Why the four requirements hold architecturally

| Requirement | Why it holds |
|---|---|
| No authoritative server | Ordering comes from an RTDB transaction; folding happens on each client. Nothing else exists. |
| Any action, any time, simultaneously | Events are always appendable. *Meaning* is decided by the reducer at the event's position in the log under strict compare-and-swap (see below): an intent based on a state a partner has since changed folds to a recorded **no-op** with a visible bounce. Two players clicking "advance Dreamwell" simultaneously produce two log entries; the first advances, the second no-ops. |
| Impossible to corrupt state via UI | There is no code path by which a UI action writes state. State is not stored (snapshots are pure caches of the fold, see below). A client can at worst append an event the reducer ignores. |
| Double-simulation architecturally impossible | Simulation is not an *action that runs*; it is a pure computation every client performs identically while folding. There is nothing to run twice, no gate to misjudge, no follow-up write to race. |

The `begunEntryKey` bug class dies the same way: "battle has begun" becomes a
*derivable fact* (a `BEGIN_BATTLE` event exists in the log). Reload = re-fold
= correct screen, always. The rule becomes checkable in review: **React
`useState` may never gate game-flow; anything both players must agree on is a
fold of the log.**

## Concurrency semantics: strict compare-and-swap

The log answers *how* concurrent actions stay consistent (they serialize into
one order; the reducer folds each against the state produced by the previous
one). The policy for what happens when both players act in the same window is
**strict compare-and-swap**: an action takes effect only if it was decided
against the current state; otherwise it bounces and the player re-decides.

Every game event carries `basedOnSeq`: the seq of the newest event folded
into the state the acting player was looking at when they committed to the
action. The reducer applies an event at seq *n* only if every seq in
`(basedOnSeq, n)` belongs to the **same actor** (see the self-chain rule
below); if any partner event intervened, the event folds to a recorded
no-op and the actor's client surfaces an explicit bounce ("your partner
acted first — the board has changed").

Consequences:

- **An action only ever resolves against the exact state its player saw.**
  Player A plays card A while player B plays card B: the first append
  applies; the second bounces; the losing player re-decides with the board
  that now contains the winning card. Two decisions made against divergent
  views of the board can never both apply.
- **Self-chain exemption.** A player's own in-flight events never invalidate
  their subsequent events: each was based on that player's optimistic fold,
  which already included their own prior intents. This lets one player act
  rapidly in succession without gating every click on a network round-trip.
  Only *partner* events break the chain — which is precisely the "state I
  decided on changed" condition the policy exists to catch.
- **Prompts are the head of the decision queue.** While `pendingPrompt` is
  open, the reducer no-ops every intent except a `RESOLVE_PROMPT` whose
  `promptId` matches. Both players racing to answer the same prompt with
  different choices: first resolution applies, second bounces.
- **Duplicate-click bugs vanish uniformly.** Both players hitting "advance
  Dreamwell" or "Begin Battle" simultaneously is just the general case:
  first applies, second is a recorded no-op — one policy, not per-feature
  special cases.
- **Undo is CAS'd like everything else** — an undo decided against a stale
  board bounces rather than yanking state out from under a partner's action.

UX contract: the optimistic local echo applies immediately; a bounce rolls
it back visibly with a notification, never silently. The bounce window is
one network round-trip (~100–300 ms) plus true simultaneity, so at human
coop rates bounces are rare — and when they happen, the player sees why and
re-decides, which is the desired behavior rather than a failure.

Escape hatch: an event type with no rules meaning and no ability to change
any decision context (card notes, cosmetic annotations) may be marked
CAS-exempt and free-run in log order. Everything that touches game state
goes through CAS, no exceptions — the reducer is the single place the policy
lives, and it is deterministic; the snapshot-sync model has no mechanism to
enforce any policy at all, so the outcome of a concurrent pair of writes is
an accident of write timing.

## Data model

```
rooms/{roomId}/
  log/                      ← the ONLY game-state location clients write
    genesis:  { seed, reducerVersion, questConfig, createdAt }
    baseSeq:  number        ← events ≤ baseSeq are compacted into baseSnapshot
    baseSnapshot: FoldState | null
    head:     number        ← seq of the newest event
    events:   { [seq]: GameEvent }   ← dense integer keys in (baseSeq, head]
  presence/  { clientId: { connected, lastSeenAt } }   ← unchanged, not game state
```

```ts
interface GameEvent {
  type: string;                 // "PLAY_CARD" | "BEGIN_BATTLE" | "RESOLVE_PROMPT" | ...
  payload: Record<string, unknown>;   // UUIDs, choice indices, drag targets
  actor: string;                // clientId, for display/telemetry
  clientTimestamp: string;      // display data only; stamped by the appender
  basedOnSeq: number;           // newest seq folded into the state the actor saw — the CAS guard
  stateHashAfter?: string;      // appender's local fold hash — divergence tripwire
}
```

`FoldState` is the fold accumulator, and is richer than today's
`BattleMutableState`:

```ts
interface FoldState {
  quest: QuestState;
  battle: BattleFoldState | null;   // mutable board + effectQueue + pendingPrompt
  undoStack: BoundedCheckpoints;    // shared undo (see below)
}
```

### Append protocol

```ts
function appendEvent(event: GameEvent) {
  return runTransaction(logRef, (log) => {
    log.head += 1;
    log.events[log.head] = event;
    if (log.head - log.baseSeq > COMPACT_THRESHOLD) compactInPlace(log);
    return log;
  });
}
```

One atomic location, so simultaneous appends serialize with no gaps and no
reordering; RTDB retries the loser automatically. With two human players the
contention is negligible. The log node stays small because compaction (inside
the same transaction, so it is atomic) folds old events into `baseSnapshot`
and deletes them; target ≤ ~200 live events / ≤ ~100 KB per transaction body.
Because the fold is pure, a compaction performed by either client produces
identical bytes — compaction racing itself is harmless.

(Alternative considered: `push()` keys give ordering without a transaction,
but the order is derived from client clocks, so a skewed clock can insert
"into the past" and force a visible history rewrite. Convergent, but ugly.
The counter transaction gives commit-order semantics for free.)

### Read path

`onValue` on `log/`. Client folds incrementally: keep `(lastFoldedSeq,
state)`; new events fold on top. Full re-fold only after compaction or
reconnect — cheap, since `applyDebugEdit` and the script tables are already
pure and the state is ~tens of KB.

### Optimistic local echo

On click, the client folds its own intent locally and renders immediately,
then reconciles when the transaction commits. If a partner event won the race
for that seq, re-fold from the confirmed log — the CAS rule folds the local
intent to a no-op, so the echo rolls back and the client shows the bounce
notification. Pure folds make this a cheap recompute with no bespoke
rollback code.

## Where the simulation goes

Everything the effect runners do today becomes reducer logic:

- **Triggers** (materialized, dreamwell, dawn): applying an event that
  materializes a card also — synchronously, inside the reducer — looks up the
  card's script in `battle-card-effects-table.ts` and applies its `edits`
  steps, or parks the script on `state.effectQueue` if a step needs input.
  The board-diffing in `use-battle-effect-runner.ts` disappears: the reducer
  *causes* the change, so it knows the trigger fired without observing it.
- **Prompts**: a script step that needs a choice sets
  `state.pendingPrompt = { id: seq, options }`. The UI renders it; either
  player appends `RESOLVE_PROMPT { promptId, choice }`. The reducer applies
  the first resolution whose `promptId` matches and no-ops the rest — both
  players racing to answer is safe by construction. All ownership-transfer
  machinery (`ownsRunRef`, `cancelPromptSignal`, `remoteCommandEpoch`)
  becomes deletable.
- **Randomness**: the reducer draws from a pure stream keyed by
  `(genesis.seed, seq, drawIndex)` — the `merchantRng` SHA-256 salted-stream
  pattern in `src/journey_v2/signals/rng.ts` is exactly right and should be
  reused. The `Math.random()` calls injected into effect contexts
  (`use-battle-effect-runner.ts:91,484,544`) and `weightedSample`
  (`draft-engine.ts:99`) are the two leaks to plug.
- **Time**: game logic never reads the clock. Anything that wants a
  timestamp (card notes) takes it from `event.clientTimestamp` — time becomes
  data in the log rather than an environment read during the fold.
- **Undo/redo**: an `UNDO` event; the fold accumulator keeps a bounded
  checkpoint stack, so undo is *shared* (both players see it, both can do it)
  and survives reload — the checkpoint stack rides inside `baseSnapshot`
  through compaction.

## Safety rails (cheap, and they detect rather than gate)

- **Reducer versioning**: `genesis.reducerVersion` is the build hash. A
  client running a different version goes read-only and prompts for reload.
  Divergence-by-stale-code becomes an explicit, visible condition instead of
  silent state corruption.
- **Divergence tripwire**: appenders include `stateHashAfter` (hash of their
  local fold). Any client whose fold disagrees logs a loud
  `fold_divergence` event to `quest-log.jsonl`. Note the failure mode is
  contained either way: the log is the truth, so a nondeterminism bug desyncs a
  *view* (fixable by reload/re-fold), never the shared record.
- **Replay CI**: because the log is a complete, portable record, record real
  session logs and assert in CI that replaying them yields the recorded final
  hash. This directly serves the AGENTS.md logging standard — "could I
  reconstruct what this algorithm did in a given production game?" becomes
  structurally *yes*: the event log **is** the reconstruction, byte-for-byte.
  Mirror appended events into `quest-log.jsonl` so existing log-analysis
  tooling keeps working.

## What gets deleted

`isPrimaryClient` and its election, `remoteCommandEpoch`, `ownsRunRef` /
prompt-ownership transfer, `cancelPromptSignal`, `commandSerial`
reconciliation in `multiplayer-battle-context.tsx`, `EMPTY_SHARED_HISTORY`,
the board-diffing halves of both effect-runner hooks, and — for migrated
state — the `NON_NULLABLE_RUN_FIELDS` guard (nothing writes state, so there
is no bad write to guard against).

## Alternatives considered

- **Harden the primary-client model** (leases, fencing tokens): still a gate
  that can misjudge; keeps the whole bug class, just makes each bug rarer.
- **CRDTs**: give automatic merge for commutative data; game rules are not
  commutative (order of "draw a card" vs "shuffle" matters), so CRDTs solve
  the wrong problem.
- **Cloud Functions as authority**: excluded by requirement, and adds
  cold-start latency to every action.

## Migration plan

The order matters: determinism and de-React-ing the simulation are
prerequisites for the sync swap, and each phase is independently shippable.

**Phase 1 — determinism hardening** (small, immediately valuable even alone)
Inject seeded RNG into effect contexts and `weightedSample`; remove
`Date.now()` from logic paths (thread timestamps in as parameters). Add a
replay test harness over recorded edit sequences asserting final-state hash.

**Phase 2 — move simulation into the reducer** (the real cost)
Rewrite `use-battle-effect-runner.ts` / `use-dreamwell-effect-runner.ts`
(~1,000 lines of orchestration) as reducer logic: `effectQueue` +
`pendingPrompt` in state, triggers fired at edit-application time. The pure
pieces (`applyDebugEdit`, script tables, `planNextEffectStep`,
`planSupportRecompute`) already exist and move mostly intact; what changes is
*who calls them and when*. React's role shrinks to rendering `pendingPrompt`
and dispatching resolutions. This phase can ship on the *current* sync layer
(single-client dispatch of the reducer's own outputs) and already fixes the
double-simulation class for the common cases.

**Phase 3 — swap the battle sync layer**
Introduce `rooms/{id}/log`, the append transaction, incremental fold,
optimistic echo, compaction. Route battle dispatch through `appendEvent`.
Delete the machinery listed above. `BEGIN_BATTLE` becomes an event and the
reveal bug is gone.

**Phase 4 — migrate quest-level state, subsystem by subsystem**
The ~5,000-line `multiplayer-quest-context.tsx` transaction writers convert
incrementally: each `writeRoomTransaction` call becomes an event type + a
reducer case. During migration the room carries both `log` (battle) and
legacy `questState`; the boundary is the existing battle-entry/exit seam.

## Honest costs

- Phase 2 is a substantive rewrite of the automation orchestration layer,
  and prompt lifecycle in particular (React refs → reducer state) is the
  hardest single piece.
- Strict CAS serializes decision-making globally: a partner action in flight
  bounces yours even when the two are causally unrelated (they play a card
  on their side while your drag is mid-air). At two-player human rates this
  is rare and self-explaining, but it is a deliberate trade of fluidity for
  the guarantee that an action never resolves against a state its player
  did not see.
- Both clients must run the same reducer build; version skew becomes a
  visible "please reload" state rather than something that limps along.
- Reducer bugs now hit both players identically. This is a trade *up*: a bug
  reproduces deterministically from the log instead of manifesting as an
  unreproducible race between clients.
