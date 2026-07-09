# Coop Event-Sourcing Implementation Audit — July 2026

**Date:** 2026-07-08
**Scope:** the coop event-sourcing rewrite
(`docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md`):
`src/eventlog/`, `src/rules/`, `src/coop/`, the provider adapters, the battle
fold driver, the client layer, and the test/CI surface around them.
**Method:** five parallel deep-read audits (engine, root reducer/CAS, battle
driver, quest reducers/providers, React layer), followed by adversarial
verification of every high-severity claim against the tree. Every finding
below cites the code it was verified against; findings that did not survive
verification were dropped.

---

## Summary

The architecture is delivering its core promise. The exactly-once machinery
that motivated the rewrite — Dreamwell scripts, materialized triggers, dawn
bookends — is genuinely edge-triggered and idempotent, with disjoint detection
windows and per-(side, turn) markers; a dedicated hunt for a double-fire path
found none. The CAS policy, prompt gating, optimistic-echo reconciliation,
`basedOnSeq` stamping, divergence tripwire gating, and quest-log sink
single-writer rule all check out against both the spec and the code. Reducers
compute on immutable copies and bounce before mutating; instance ids and site
runtimes are seq-/seed-deterministic.

The gaps cluster in three places:

1. **Convergence holes at the edges of the log lifecycle** — compaction can
   record a different outcome than live clients computed (P0-1); per-client
   URL config parameterizes the "deterministic" content providers (P0-2); and
   the draft flow still generates offers client-side with `Math.random`
   outside the reducer (P0-3).
2. **Failure paths that fail silently or fail closed-forever** — reducer
   throws are swallowed with no telemetry, a mis-shaped script wedges a
   prompt permanently, a rejected append leaves a phantom echo forever, and a
   corrupt snapshot freezes every client (P1 group).
3. **The resilience test the spec calls "the direct encoding of the goal"
   runs in no automated pipeline** — CI builds and deploys but executes zero
   tests, and the chaos storm exercises a toy reducer, never the real one
   (P1-11).

None of these undermine the design; all are fixable inside it. The prioritized
task list is at the end.

---

## What holds up (verified strengths)

These were audited adversarially and confirmed sound — they are the load-bearing
parts of the resilience story:

- **Exactly-once battle automation.** Materialized-trigger detection windows
  are disjoint: `battle-events.ts:395-402` diffs only the command edit against
  the pre-command board, while the driver diffs each queued dispatch against
  the board at that moment (`driver.ts:208-210`, `326-327`), so a card moved
  by either layer fires exactly once. Dreamwell is gated by the
  `dreamwellDrawnTurn` edge (`battle-events.ts:441-460`); Dawn by both the
  phase/handoff edge and the `dawnFired[side] !== turnNumber` marker
  (`battle-events.ts:421-438`), so a rewind or same-turn `SET_PHASE dawn`
  cannot re-fire it.
- **Determinism of the battle fold.** Instance ids mint from
  `nextBattleCardOrdinal` (deterministic in-board counter); FIFO ordering is
  by fixed rank-slot order; the rng draw counter is threaded through dawn,
  support, and the queue drain with offset indices so no two draws share an
  index; `nowMs` comes from the committed `clientTimestamp`.
- **CAS core.** `isInterveningWindowClear` (`reducer.ts:119-135`) implements
  the self-chain and decision-neutral carve-outs exactly per spec; bounced
  events are excluded from later windows (`fold.ts:97,146-149`); `OPEN_SITE`
  is exempt from being bounced but counts as intervening (`events.ts`,
  covered by `reducer.test.ts:519`).
- **Prompt lifecycle plumbing.** `promptId = seq` is unique and monotonic;
  the client refuses to resolve a prompt whose opening event is still an
  optimistic echo (three independent gates: `hooks.ts:296-305`,
  `useConfirmedPromptId`, and the disabled control in
  `PlayableBattleScreen.tsx:268-276`); the parked-run invariant
  `effectQueue[0] === pendingPrompt.run` holds; `PendingPrompt` round-trips
  as pure data (`driver.test.ts:428`).
- **Client stamping and tripwire.** `basedOnSeq` is the newest *confirmed*
  seq via a live closure variable (`client.ts:266`) — no stale-capture
  hazard; `stateHashAfter` is written only on a clean prediction
  (`client.ts:273-282`) and compared only when `basedOnSeq === seq - 1`
  (`client.ts:165-176`), so the tripwire cannot false-alarm under ordinary
  concurrency.
- **Quest-domain race guards.** Shop double-buy and draft double-pick are
  rejected twice (CAS plus domain guards on `slot.purchased` /
  pack-membership); essence is clamped at zero everywhere; `OPEN_SITE` is
  idempotent with zero rng draws on the short-circuit path
  (`sites.ts:305-351`); `SELECT_DREAMCALLER` resolves from `quest.seed`,
  independent of seq. No in-place mutation before a bounce decision was found
  in any domain case. No card-name-keyed maps or name-equality comparisons in
  the audited surface.
- **Log sink and version gate.** The single-writer rule with a monotonic
  high-water mark produces no duplicates and no gaps across
  refold/compaction; the `reducerVersion` gate renders `VersionGateScreen`
  with no children mounted, unbypassed.
- **Boundary hygiene.** Lint enforces no-Firebase/no-React in `src/rules/`,
  `Math.random`/`Date.now`/argless-`new Date()` bans, and eventlog↔rules↔coop
  dependency direction (`eslint.config.js:203-279`). No leftover legacy
  multiplayer imports; no out-of-band RTDB writes; the deletion inventory is
  complete (`src/multiplayer/`, both contexts, `history.ts` are gone).

---

## Findings

Severity is about distance from the stated goal: *two players taking random
overlapping actions always converge to one internally sane state, with
simulation applied exactly once, and failures visible.*

### P0 — convergence holes

#### P0-1. Compaction can flip a live-applied event to "bounced" in the snapshot

`append.ts:94` folds the compaction batch with `base.seq = oldBaseSeq`, and
`computeIntervening` (`fold.ts:167`) reports `"unknown"` for any event whose
`basedOnSeq < base.seq` — evaluated against the horizon *at compaction time*,
not the horizon at the event's original fold. An event that a caught-up client
applied (concrete window, e.g. a pure self-chain) whose `basedOnSeq` falls
below a later compaction horizon re-folds inside `applyAppend` as
`"unknown"` → bounced. The snapshot then encodes it as a no-op while every
caught-up client (which never refolds, because `node.baseSeq ≤ lastFoldedSeq`
keeps it on the incremental path, `client.ts:229-231`) has it applied.

*Failure scenario:* a client fires a long self-chain burst (AI turns, rapid
clicks while the partner idles) with `basedOnSeq` pinned at its last confirm.
Live folds apply all of it via the self-chain rule. The second compaction's
horizon passes `basedOnSeq`; the batch refold bounces the entire burst inside
the snapshot. A player who reloads — or any late joiner — folds from that
snapshot and is missing every one of those applied events, permanently
diverged from the player who stayed connected. The hash tripwire cannot fire
(its gate requires `basedOnSeq === seq - 1`).

The emulator suite's header comment concedes equivalence "only holds above the
compaction horizon by design" — that concession is exactly this hole.

*Fix direction:* an event's outcome must be immutable once folded. Record the
outcome in the log (e.g. the appender or first folder stamps it, or compaction
carries an outcomes sidecar), or make the compaction fold reuse the horizon
each event saw originally (`base.seq` of the *previous* snapshot per event
range), or — simplest — have compaction preserve each event's already-known
outcome instead of re-deciding it. Then add the missing test: fold a
stale-`basedOnSeq` self-chain past two compactions and assert
snapshot-refolders equal live folders.

#### P0-2. Provider content is parameterized by per-client URL config that genesis does not pin

`registerGameProviders` builds the five reducer content seams from
`loadQuestContent(runtimeConfig.poolVariant, draftMode, fresh20PackSize,
journeyVariant)` (`App.tsx:695-711`), and `runtime-config.ts:93-113` parses
those from the URL query string (`?algo=`, `?journey=`, `?packsize=`). The
version gate pins `genesis.reducerVersion` (build hash) only. Two clients on
the same build joining the same room with different query params register
different content and fold every provider-backed event differently —
different draft pools, site offers, battle inits — a permanent, silent
divergence the version gate cannot catch and the tripwire only reports after
the fact.

*Failure scenario:* player A shares a room URL that includes `?algo=…` from
their own experimentation; player B joins via a hand-typed URL with the room
id only. Same build, same room, divergent folds from the first `START_QUEST`.

*Fix direction:* content parameters that affect the fold are game state — put
them in `genesis` at room creation and have `RoomGate`/provider registration
read them from genesis (or gate mismatches exactly like `reducerVersion`).
Registration ordering itself is safe today (render-gated before `RoomGate`
mounts), and same-build TOML content is identical; the URL parameters are the
one unpinned input.

#### P0-3. The draft flow lives outside the event-sourcing model

`PICK_DRAFT_CARD` requires `draftState.activeSiteId !== null` and a non-empty
offer (`draft.ts:144,154`), but the reducer's `OPEN_SITE` returns null for
draft sites (`sites.ts:346-349`), and no player-facing reducer case activates
a draft. Activation happens in the UI: `DraftSiteScreen.tsx:520-565` (and the
Tango adapter, `DraftSiteScreenAdapter.tsx:77-92`) computes
`enterDraftSiteState(...)` client-side — which draws from `Math.random`
(`quest-state-actions.ts:139-142` marks this "the sanctioned interim") — gates
the bootstrap on `useState`/`useRef` latches, and injects the whole computed
draft state through the debug-shaped `SET_DRAFT_STATE` event.

This breaks all three project rules at once: offers are not reproducible from
the event log (the AGENTS.md reconstruction standard), React local state gates
game flow, and clients write computed state rather than intents. It is also
racy in exactly the way the rewrite eliminates elsewhere: two players entering
the draft site simultaneously each roll a different offer and both append
`SET_DRAFT_STATE`; CAS keeps the log convergent (one bounces), but until
reconciliation the two players are looking at *different offers*, and the
surviving offer is whichever client's local roll won the race.

*Fix direction:* an `OPEN_DRAFT_SITE { siteId }` (or extending `OPEN_SITE`)
reducer case that generates the offer deterministically from `ctx.rng` — the
same shape `OPEN_SITE` already uses for shops and merchants — with the
draft-engine's `weightedSample` taking the injected rng (the spec already
requires this). Demote `SET_DRAFT_STATE` to debug-only.

### P1 — silent or permanent failure paths

#### P1-1. The root reducer's blanket catch defeats poison-event observability

`reduceGameEvent` wraps everything including `routeDomain` in
`try { … } catch { return bounce(state); }` (`reducer.ts:54-74`). The engine's
containment layer (`fold.ts:128-144`) — dev rethrow so programmer errors stay
visible, `FoldError` → `fold_error` telemetry in production — is dead code for
the real config, because the inner catch fires first and discards the error.
A genuine reducer bug becomes an invisible deterministic bounce: no crash, no
stack trace, no log line, on every client, forever.

*Fix direction:* narrow the try to the CAS prelude (whose inputs are
event-content and legitimately hostile) and let domain throws propagate to
`fold.ts`'s containment, which already implements the spec's dev/prod split.
Add the missing test: a throwing domain case yields a bounce **plus** a
`fold_error` report in prod mode and a rethrow in dev mode.

#### P1-2. A throwing effect-script cursor wedges a battle permanently and silently

`assertCursorMatchesRest` and the cursor-path resolvers throw on a script
shape the cursor cannot address (`driver.ts:53,77,330`). Combined with P1-1
that throw becomes a silent bounce that leaves `pendingPrompt` open; rule 4
then bounces every other battle event, and every `RESOLVE_PROMPT` for that
prompt re-throws → re-bounces. The battle is deterministically wedged on both
clients with zero telemetry.

*Fix direction:* on a contained failure while resolving/advancing a parked
run, drop the run and clear the prompt (degraded-but-live beats wedged), and
log it loudly via the `fold_error` channel P1-1 restores. Add the containment
test.

#### P1-3. A rejected append strands a phantom optimistic intent forever

`submit` pushes into `pending`, renders the echo, and returns `io.append(event)`
with no rejection handling (`client.ts:284-288`). Pending entries are removed
only by nonce match against a *confirmed* event (`client.ts:181-186`). If the
transaction rejects (network blip, abort, the P1-5 throw paths), the event was
never committed, no confirmed event ever carries the nonce, and the echo is
folded into the displayed state indefinitely — a phantom action with no toast,
diverging that player's view until reload.

*Fix direction:* on append rejection, remove the pending entry by nonce,
recompute, and surface the bounce toast path ("your action didn't send").
Test with an injected `io.append` rejection.

#### P1-4. Refold paths silently drop outcomes, toasts, and pending re-validation

Three related holes in `client.ts`:
- When compaction advances past a lagging client
  (`node.baseSeq > lastFoldedSeq`, `client.ts:229-240`), the events between
  its old fold point and the new horizon are gone from `node.events`; their
  outcomes are never emitted. An own bounce in that gap loses its toast, and
  an own *committed* event in that gap never nonce-matches — the pending
  entry sticks (same terminal state as P1-3).
- On any full refold, pending intents are never explicitly re-validated and
  dropped-with-toast; a now-bouncing echo just vanishes from the recompute
  (`client.ts:207-224`). The spec requires the rollback to be explained
  ("never silent").
- `onFoldError` fires outside the `lastEmittedSeq` guard (`client.ts:146-148`),
  so every full refold re-spams `fold_error` for already-reported contained
  errors; and a rewind full-fold leaves `lastEmittedSeq`/`divergenceReported`
  high (`client.ts:236-240`), suppressing re-emission for regrown seqs.

*Fix direction:* after any full refold, sweep `pending` — drop entries whose
nonce can no longer confirm (seq horizon passed) or that bounce against the
fresh confirmed state, with a toast per drop; move `onFoldError` under the
emission guard; reset emission high-water on rewind.

#### P1-5. Compaction's transaction callback has uncontained throw paths

`applyAppend` folds the compaction batch with the default `devMode`
(`append.ts:94` passes no options), so in dev a poison event crossing the
horizon *throws inside the `runTransaction` updater* — rejecting every
subsequent append by whichever client triggers compaction: a permanent append
outage that punishes the wrong client. The explicit
`throw new Error("compaction gap…")` (`append.ts:88`) and the unguarded
`JSON.parse(encoded.genesis)` (`append.ts:81`) are uncontained even in
production. Compaction re-folds already-committed events; nothing about it
should ever throw out of the updater.

*Fix direction:* pass `devMode: false` to the compaction fold explicitly
(committed events are already-contained history; dev visibility belongs on
the live fold path), and convert the gap/parse failures into transaction
aborts surfaced as append errors rather than throws mid-updater. Test a
poison event crossing the horizon under `test:emulator`.

#### P1-6. A corrupt genesis or baseSnapshot string freezes every client

`decodeLogNode` documents itself as never throwing, but
`JSON.parse(encoded.genesis)` and `JSON.parse(rawBaseSnapshot)`
(`subscribe.ts:47,52-53`) are unguarded — only event strings are wrapped. The
same corrupt bytes reach every client, so every `onValue` callback throws on
every update: the room is frozen with no fold, no outcome, and no version-gate
style messaging — strictly worse than the degraded room the spec designs for.

*Fix direction:* wrap both parses; surface a "room unreadable" state through
the same gate machinery as `VersionGateScreen`.

#### P1-7. The dense-window gap-skip permanently drops a seq

`foldConfirmedRange` skips a missing seq with a comment claiming "the next
node with the event present will fold it" (`client.ts:128-131`) — but the loop
then advances `lastFoldedSeq` past the hole (`client.ts:141`), so the next
incremental fold starts above it: the event is never folded, and the events
folded past the hole computed their intervening windows without it. The
recovery the comment promises cannot happen. A single-location transaction
should never produce a sparse snapshot, so the trigger is unlikely — but the
handler's job is exactly the unlikely case, and its current behavior converts
a transient anomaly into permanent divergence.

*Fix direction:* stop at the first gap (fold nothing past it, leave
`lastFoldedSeq` below it) so a later complete node genuinely resumes; count
occurrences in the log sink.

#### P1-8. One player gesture fans out to N events with no atomicity

`planBasicAutomationCommands` expands a gesture into an ordered command list
(play → move + spend energy; turn handoff → challenge + hand-limit + banish +
draw), and the screen submits them as separate `BATTLE_COMMAND` events in a
fire-and-forget loop (`PlayableBattleScreen.tsx:295-297`). All share the same
`basedOnSeq`; the self-chain rule protects them from *each other*, but one
applied partner event landing mid-gesture bounces the tail: a card in play
with its cost unspent, a handoff with the incoming draw skipped. Both clients
agree on the half-applied result — convergent but not sane.

*Fix direction:* one gesture = one event. Either submit the planned list as a
single `BATTLE_COMMAND` carrying multiple edits (the reducer already applies
edit lists atomically) or add a `BATTLE_GESTURE { commands: [...] }` case that
applies all-or-nothing.

#### P1-9. Hash and encode disagree about `undefined`, and the round-trip assertion is missing

`hashState` makes an `undefined`-valued key explicit via a sentinel
(`hash.ts:31-34`) while `encode = JSON.stringify` drops the key entirely. For
any state carrying one, `hash(live) ≠ hash(decode(encode(live)))`: after
compaction, snapshot-refolders hash differently from live folders — a false
`fold_divergence` and a structurally different state. The spec's dev-mode
encode/decode round-trip assertion after every fold step, which would catch
the vector at the source, is not implemented anywhere in the fold path. The
live vectors are `LOAD_STATE` (`lifecycle.ts:366-376` casts unvalidated
snapshots straight in) and provider outputs, whose JSON-safety is only tested
through *fake* providers (`quest-properties.test.ts` registers no
`BattleInitProvider` at all, so the battle slice — the most `undefined`-prone
part of `FoldState` — is never round-trip- or hash-checked).

*Fix direction:* implement the dev-mode round-trip assertion in
`foldEvents`/client fold; align the two representations (either canonicalize
state through encode→decode before hashing, or strip `undefined` at reducer
boundaries); extend the property tests to register real/battle providers.

#### P1-10. `test:emulator` and the chaos storm run in no automated pipeline — CI runs zero tests

Both GitHub workflows run `npm ci && npm run build` only. `npm test` (unit +
replay fixtures) and `npm run test:emulator` (two-client convergence,
compaction under contention, the seeded chaos storm the spec calls "the
direct encoding of the resilience goal") execute only when someone runs them
by hand. The chaos storm also drives a *toy* reducer — nothing anywhere
exercises two clients folding the real `GAME_ENGINE_CONFIG` concurrently. The
replay fixtures are synthetic-provider-only (real generators deferred per
`replay.test.ts:10-11`), so the whole-reducer safety net doesn't cover the
production content path either.

*Fix direction:* add a CI workflow running lint + typecheck + `npm test` on
PRs, and `test:emulator` (Java + firebase-tools are installable on
ubuntu-latest); add a real-config two-client convergence scenario to the
emulator suite; record at least one real-session fixture once the system is
exercised, per the spec's own testing plan.

**Status:** `.github/workflows/checks.yml` runs `lint` + `typecheck` + `npm
test` and a `firebase emulators:exec`-backed `test:emulator` job on every push
to master and pull request. `emulator.integration.test.ts`'s scenario D drives
two clients through the REAL `GAME_ENGINE_CONFIG` (not the toy reducer) via
`registerReplayFixtureProviders()`, exercising `START_QUEST`,
`SELECT_DREAMCALLER`, `ADJUST_ESSENCE`, `OPEN_SITE`, `ENTER_DRAFT_SITE`, and
`PICK_DRAFT_CARD` under concurrent storm conditions, converging including a
post-compaction joiner. Recording a real-session replay fixture remains
deferred (it requires the deployed system to be exercised by real players
first).

### P2 — converge-but-wrong game correctness

- **P2-1. Support recompute runs before the effect queue drains.**
  `battle-events.ts:464-471`: step 5 recomputes support, then step 6 advances
  the queue; the driver never recomputes. A queued effect that moves a
  supporter or supported card (e.g. the Celestial Gateway dreamwell,
  `dreamwell-effects-table.ts:200-218`) leaves `staticSparkBonus` stale until
  the next command — deterministic on both clients, but the ally scores with
  wrong spark. Fix: recompute support after the queue drain (and after each
  resolution drain in `resolvePendingPrompt`), or fold recompute into the
  driver's post-dispatch step. Add the "support correct after a
  queued-effect board change" test.
- **P2-2. Non-active-side dreamwell reveal fires zero times.**
  `battle-events.ts:441` derives `revealSide` from `boardAfter.activeSide`
  instead of the `DRAW_DREAMWELL_CARD` edit's own side, so a manual
  extra-draw for the non-active side (the Lily Lake case) checks the wrong
  side's `dreamwellDrawnTurn` and never queues that card's script.
- **P2-3. Double-click double-applies delta events.** Two rapid clicks are two
  distinct nonces (`client.ts:257`) sharing `basedOnSeq`, and the self-chain
  rule waves the second through. State-guarded intents self-reject, but
  delta-shaped ones (`ADJUST_ESSENCE`, `ADJUST_MAX_ESSENCE`,
  `GRANT_FREE_REROLLS`, `PURGE_RANDOM_BANE_CARDS`) apply twice. Fix at the
  action layer (disable-while-pending on delta buttons, or an idempotency
  key the reducer checks for reward-style grants).
- **P2-4. `LOAD_STATE` accepts any object.** `lifecycle.ts:366-376` casts
  `snapshot as QuestState` and `asBattleFoldState` is a bare cast; a
  `LOAD_STATE` can null run fields mid-run, inject a `seed` different from
  `genesis.seed`, or plant an arbitrary `pendingPrompt`/`effectQueue`. All
  clients converge — to a possibly-insane state. The nullability property
  test carves it out. Fix: validate the shape and the invariants
  (`seed === genesis.seed`, run-field non-nullability, script-cursor
  resolvability) and bounce on violation; keep it debug-gated by convention
  *and* by check.
- **P2-5. Applied no-ops pollute partners' CAS windows.**
  `markSiteVisited` (already-visited) and `dismissStartingDeckPopup`
  (already-seen) return unchanged state as **applied**
  (`lifecycle.ts:245,269`), so they enter later intervening windows and
  bounce unrelated partner intents. Return the idempotent-no-change case as
  decision-neutral (add to the neutral set) or bounce it; either keeps it out
  of CAS windows.
- **P2-6. `pick-cards` resolution accepts ids outside the candidate set.**
  `coercePromptResolution` (`battle-events.ts:633-651`) +
  `effect-runner-core.ts:120-123` run `prompt.resolve(chosenIds, ctx)` without
  checking membership in the options fixed at open. Both clients fold it
  identically, but it is a game-integrity hole (and a poison-input risk into
  script code). Validate `chosenIds ⊆ candidates`, bounce otherwise.
- **P2-7. Room creation overwrites an existing log.** `createRoom` and
  `createRoomEvictingStale` write the genesis node with no existence check
  (`room.ts:120,192-208`); a 6-char id collision or double-create obliterates
  a live game. Guard creation on absence (transaction).
  **Status:** `createRoom` writes the genesis node via a transaction that
  aborts (rejecting with `RoomExistsError`) when a node already exists at that
  id; `createRoomEvictingStale` uses the same guard for the new room's write
  before evicting stale siblings separately. `RoomGate.createAndNavigateToRoom`
  retries with a fresh `generateRoomId()` up to 3 times on a collision.
- **P2-8. AI gate trusts optimistic presence.** `ai-may-run-here.ts:40-45`
  treats unknown presence as "may run", so both tabs can run the planner
  during startup or a presence flap. CAS keeps the log convergent (distinct
  `ai:<clientId>` actors bounce each other), so this is redundancy rather
  than corruption — but flip the default to "may not run until presence is
  observed", and note presence has no heartbeat (`room.ts:228-252`): a
  crashed partner tab suppresses the AI until RTDB notices.
  **Status:** `aiMayRunHere` returns `false` (never runs) while presence is
  unknown (`connectedCount` `null`/`undefined`); it runs only once presence is
  known and this client is the sole connected one. A presence heartbeat
  remains out of scope — the current onDisconnect-only behavior matches the
  design spec.

### P3 — hygiene and latent traps

- **P3-1.** `appendEvent` aborts on the null first-call (`append.ts:121-131`)
  instead of returning the node unchanged to force a server-value retry; safe
  today only because the subscription warms the cache before `submit` is
  reachable. Harden or document the coupling.
  **Status:** documented in place — the comment at the abort names the
  invariant it leans on (the live subscription warms the RTDB cache before
  `submit` is reachable).
- **P3-2.** The client fold base bypasses `config.decode`
  (`client.ts:110-112` casts the subscribe-parsed snapshot) while compaction
  uses `config.decode` — identical only while decode is bare `JSON.parse`. A
  future migrating/reviving decode silently splits the two paths. Route the
  client base through `config.decode` (of the raw string) or delete the
  config hook so the trap can't arm.
  **Status:** `LogNode.baseSnapshot` is now the raw encoded string (subscribe.ts
  validates it parses, for the same corrupt-node contract, but no longer hands
  the parsed value to callers); `client.ts`'s `baseState` calls
  `config.decode(node.baseSnapshot)` directly — the exact same path
  compaction (`append.ts`) uses.
- **P3-3.** `Date.parse(ctx.timestamp)` in `src/rules`
  (`battle-events.ts:386,717`) is implementation-defined for non-ISO input
  and unlinted; nothing in rules enforces the ISO contract `client.ts:263`
  happens to satisfy. Validate/parse strictly (or lint `Date.parse` alongside
  `Date.now`).
  **Status:** `src/rules/battle/timestamp.ts`'s `isoTimestampToMs` is a
  strict, hand-rolled ISO-8601 UTC parser (regex + `Date.UTC` + round-trip
  validation) replacing every `Date.parse(ctx.timestamp)` call site in
  `battle-events.ts`/`driver.ts`; `eslint.config.js` bans `Date.parse` in
  `src/rules/**` alongside the existing `Date.now` ban.
- **P3-4.** The per-event rng namespace is flat (`fold.ts:122` hands one
  closure to the whole reducer call; `rng-stream.ts:17` and `draft.ts:106`
  both start at index 0). Discipline currently holds by convention (verified:
  battle threads one counter; quest cases have one consumer each), but
  nothing prevents a future second consumer at the same seq from correlating
  draws. Centralize allocation (a draw *cursor* on ctx rather than an
  indexed getter) or document the one-consumer-per-event rule where cases
  are added.
  **Status:** documented in place — `EventContext.rng`'s doc comment states
  the one-rng-consumer-per-event convention and what two correlated consumers
  would break.
- **P3-5.** Three hand-maintained event-type registries (`EventPayloads`,
  the `routeDomain` switch, `KNOWN_EVENT_TYPES`) with no exhaustiveness tie;
  drift fails safe (bounce) but silently. A type-level check
  (`satisfies`-based exhaustive map) closes it.
  **Status:** `KNOWN_EVENT_TYPES` derives from a
  `KNOWN_EVENT_TYPES_AS_OBJECT: Record<GameEventType, true>` literal
  compile-time-tied to `EventPayloads`; `routeDomain`'s switch narrows to
  `GameEventType` and its `default` arm assigns to `never`, so an
  `EventPayloads` key without a case fails to typecheck. `events.test.ts`
  drives every `KNOWN_EVENT_TYPES` member through `routeDomain` as a runtime
  companion.
- **P3-6.** The rule-2 soundness comment ("no exempt type alters battle
  state") is already false: `SET_CARD_NOTE` writes
  `board.cardInstances[id].notes` (`battle-events.ts:710-722`). Correct
  today because notes are decision-irrelevant — restate the invariant as
  "no exempt type alters *decision-relevant* battle state" where the fast
  path is documented, so the tripwire guards the real condition.
  **Status:** `reducer.ts`'s `isCasExempt` doc comment states the narrower,
  correct invariant ("no CAS-exempt type alters decision-relevant battle
  state — notes mutate `cardInstances[id].notes` only").
- **P3-7.** `hashState` maps `NaN`/`Infinity` to `"null"` (`hash.ts:35`),
  colliding with actual null — a nondeterminism bug producing `NaN` slips the
  tripwire. Emit a distinct sentinel.
- **P3-8.** Merchant deck entries mint via the legacy `deriveEntryIdCounter`
  (`resolveMerchantOffer.ts:83`) instead of `mintEntryId`'s seq-keyed scheme —
  deterministic, but one id scheme should win.
  **Status:** `resolveMerchantOffer.ts`'s entry-id allocator accepts an
  optional `mintEntryId(deck, index)` callback; `site-provider.ts`'s real
  `resolveMerchant` implementation passes one backed by
  `mintEntryId(deck, seq, index)` (deck.ts's single seq-keyed scheme, now
  taking `seq` directly rather than a whole `EventContext`), threaded from
  `SiteContentProvider.resolveMerchant`'s new `seq` field.
- **P3-9.** `bounce` records pass empty `interveningSeqs` (`hooks.ts:203`),
  so `event_bounced` log lines cannot answer *which* partner event caused a
  bounce — the exact question the AGENTS.md logging standard asks. Thread the
  seqs through `onEventOutcome`.
  **Status:** `FoldOutcome` gains `interveningSeqs?: number[]`, attached to
  every bounced outcome whenever the intervening window was enumerable;
  `client.ts` threads it through `onEventOutcome`'s new optional 4th arg;
  `hooks.ts` passes `detail?.interveningSeqs` to `recordBounce` instead of a
  hardcoded `[]`.
- **P3-10.** `package.json`'s `test:emulator` filter still names
  `src/multiplayer/firebase-emulator.integration.test.ts`; vitest treats it
  as a non-matching filter and runs the eventlog suite anyway (verified), so
  this is cosmetic — trim it.
  **Status:** trimmed; `test:emulator` now names only
  `src/eventlog/emulator.integration.test.ts`.
- **P3-11.** `setMaxDreamsigns`/`setCompletionLevel` accept any finite number
  (`lifecycle.ts:150-167`); a negative max silently blocks all dreamsign
  adds. Debug-only surface; clamp anyway.
  **Status:** both clamp to a non-negative integer
  (`Math.max(0, Math.trunc(value))`); a non-finite payload still bounces.

---

## Test coverage gaps (consolidated)

Beyond the CI gap (P1-10), the specific missing tests that map to findings:

1. Snapshot-vs-live equivalence for a stale-`basedOnSeq` applied self-chain
   across two compactions (P0-1) — the single most important missing test.
2. Two real-config clients (real providers, real reducer) converging under
   the emulator, including a chaos storm variant (P1-10).
3. Injected `io.append` rejection → pending entry dropped with toast (P1-3).
4. Lagging client crossing a compaction horizon: own-bounce toast, nonce
   reconciliation, `onFoldError` dedup (P1-4).
5. Throwing domain reducer → prod `fold_error` + bounce, dev rethrow (P1-1);
   throwing cursor mid-prompt → prompt cleared, not wedged (P1-2).
6. Poison event crossing the compaction horizon inside `runTransaction`
   (P1-5); corrupt genesis/baseSnapshot node (P1-6); node with a seq hole
   then a complete node (P1-7).
7. Support recompute after a queued effect changes board shape (P2-1);
   dreamwell exactly-once under a prompt-interleaved multi-run drain (the
   historical bug's exact shape — nearest suites cover the halves, not the
   composition).
8. Encode/decode round-trip + hash over states produced by *real* providers,
   including a non-null battle slice (P1-9).
9. A non-identity `config.decode` through both compaction and the client
   base path (P3-2).

---

## Prioritized task list

**P0 — convergence (do first):**
1. Make event outcomes immutable across compaction (fix + equivalence test).
2. Pin fold-relevant runtime config (`?algo=`/`?journey=`/`?packsize=`) in
   genesis; gate mismatches like `reducerVersion`.
3. Move draft-offer generation into the reducer behind an intent event with
   `ctx.rng`; demote `SET_DRAFT_STATE` to debug.

**P1 — failure visibility and terminal states:**
4. Narrow the root reducer catch; restore `fold_error`/dev-rethrow; add
   containment tests.
5. Clear a wedged prompt on contained driver failure.
6. Handle `io.append` rejection (drop pending + toast).
7. Sweep/re-validate pending on full refold; fix outcome-loss past
   compaction; dedup `onFoldError`; reset emission state on rewind.
8. Contain all throw paths inside the compaction transaction
   (`devMode: false`, abort instead of throw).
9. Guard genesis/baseSnapshot parsing; render a readable failure state.
10. Stop at gaps instead of skipping them in `foldConfirmedRange`.
11. Make one gesture one event (atomic automation command lists).
12. Implement the dev-mode encode/decode round-trip assertion; reconcile
    hash/encode `undefined` handling; property-test the battle slice with
    real providers.
13. Stand up CI: lint + typecheck + `npm test` + `test:emulator`; add a
    real-config two-client convergence test; record a real-session replay
    fixture.

**P2 — game correctness:** support-recompute ordering; non-active-side
dreamwell reveal; delta-event double-click; `LOAD_STATE` validation;
applied-no-op CAS pollution; `pick-cards` candidate validation;
create-room existence guard; AI presence default.

**P3 — hygiene:** as listed above; each is small and independent.
