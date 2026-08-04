# Coop Event-Sourcing Re-Audit — 2026-07-09

Scope: the implementation of
`docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md`
after the 2026-07-08 hardening plan
(`docs/superpowers/plans/2026-07-08-coop-hardening.md`) landed in full.
The 2026-07-08 audit's findings (P0-1..P3-11) are resolved and are not
re-reported; finding ids below are namespaced `R-` (re-audit) to avoid
collision with the earlier series.

Method: four parallel deep-read audits (eventlog engine; rules reducer +
battle driver; coop/React layer + AI + repo-wide sweeps; test/CI coverage vs
the spec's §Testing requirements), followed by direct source verification of
every P0/P1 finding. `npm run lint`, `npm run typecheck`, and `npm test`
(4057 tests) all pass on this tree; CI genuinely runs the emulator suite on
every PR and master push.

## Summary

The core architecture is sound and the hardening held up: the append
transaction, compaction equivalence, applied-index seeding, optimistic-echo
reconciliation, CAS policy, prompt lifecycle, and exactly-once dreamwell/dawn
firing all survived adversarial review. The resilience goal — two players
taking random overlapping actions always converging to one sane state — is
structurally met for the paths the system exercises deterministically.

Three classes of problems remain:

1. **One gameplay-breaking interaction (R-P0-1)**: the gesture-atomicity fix
   and the fold-time prompt parking compose so that playing a cost-bearing
   interactive card, or revealing a prompt-bearing dreamwell card, emits a
   multi-command gesture that bounces deterministically forever. Both clients
   converge — on a soft-locked game.
2. **Two genuine cross-client nondeterminism leaks (R-P0-2, R-P0-3)** on the
   fold path: a random-comparator `sort` and host-locale `localeCompare`.
   These produce confirmed-fold divergence across browser engines/locales,
   the exact failure class the rewrite exists to eliminate.
3. **Silent-failure gaps at the edges**: a non-total decode path, invisible
   permanent compaction failure, live-room eviction with no victim signal,
   presence that never re-asserts after a blip (defeating the single-AI-runner
   guarantee), and per-client provider-content fallbacks that can silently
   desync folds.

The journey (Dream Journey) surface is the one area that predates the
architecture and still violates it outright (local React state gates
commitment; random outcomes rolled client-side with `Math.random`; a
card-name equality lookup). It converges by luck of payload-carried values,
not by design.

## What holds up (verified strengths)

- `applyAppend` is a genuinely pure updater, safe across RTDB transaction
  retries; compaction equivalence and outcome-immutability across the horizon
  are directly tested; the applied-index (old P0-1 fix) is threaded
  consistently through compaction, joiner refold, and incremental fold.
- RTDB array coercion of dense integer `events` keys is handled on both the
  read (`Object.entries`) and write (spread) paths, with a test.
- Echo reconciliation is rollback-by-recomputation with nonce matching; the
  `basedOnSeq === seq - 1` divergence-tripwire gate eliminates the classic
  skewed-seq false positive; gap-break folding with a resume-below-the-hole
  high-water is internally consistent and well-tested.
- The CAS rule-2 fast path is sound: `promptId` = opening seq is unique, at
  most one prompt parks per event, racing resolves lose deterministically.
- The sanctioned `RESOLVE_PROMPT` catch is deterministic (no
  environment-dependent operations on the resolve path) and the pre-throw
  board is genuinely untouched.
- Exactly-once simulation for the historically buggy paths is closed three
  ways for dreamwell (per-(side,turn) no-op guard, edge detection,
  `dawnFired` marker) and materialized triggers fire exactly once regardless
  of which layer moved the card.
- `applyDebugEdit` deep-clones; journey cases spread immutably; no
  identity-keyed memoization inside `src/rules/`; rng is a pure keyed
  sha256 stream honoring the one-consumer-per-event convention.
- Provider registration is synchronous before any fold can run
  (`App.tsx` registers before the render that mounts `RoomGate` unblocks),
  and `ContentConfig` in genesis pins fold-relevant params.
- The `OPEN_SITE` / `ENTER_DRAFT_SITE` idempotency claims hold: identical
  state returned before any rng draw on the already-open path.
- `hooks.ts` LogClient lifecycle is StrictMode-correct (two sequential
  clients, never two live subscriptions); the pre-baseline append queue
  drains exactly once; the journey-log sink's high-water + fresh-per-mount
  clientId dedupe correctly across refolds.
- CI runs lint/typecheck/vitest plus the emulator suite (including a
  real-reducer two-client storm with compaction and a post-compaction joiner)
  on every PR and master push; no silently-excluded suites found.

## Findings

### P0 — gameplay-breaking or convergence holes

- **R-P0-1. Multi-command gestures that park a prompt mid-sequence bounce
  forever: cost-bearing interactive cards are unplayable and prompt-bearing
  dreamwell reveals soft-lock the turn.**
  `applyBattleCommandStep` bounces any command while a prompt is pending
  (`src/rules/battle/battle-events.ts:379-381`), and each command's step
  drains the effect queue before the next command runs (step 5,
  `battle-events.ts:463+`), so a prompt parked by command N bounces command
  N+1 and — by gesture atomicity (`battleGesture`, all-or-nothing) — the
  whole event. The automation planner emits exactly this shape on the normal
  path (automation defaults on):
  - `planCardPlay` (`src/rules/battle/basic-automation.ts:151-202`) emits
    `[move-to-play, ADJUST_CURRENT_ENERGY]` whenever `spend > 0`. Playing
    Ringwatcher (`647f5150-b2e0-424b-9480-27557642524e`, cost 3,
    "▸Materialized: Foresee 1" — Starter rarity) with ≥1 energy parks the
    foresee prompt on the move, then the spend bounces the gesture. Every
    retry bounces identically; the card is unplayable except at 0 energy.
  - `planDreamwellReveal` (`basic-automation.ts:212-229`) always emits
    `[DRAW_DREAMWELL_CARD, SET_MAX_ENERGY, SET_CURRENT_ENERGY]`. When the
    revealed card's script needs input (many `DREAMWELL_EFFECTS` entries),
    the reveal parks the prompt and the energy edits bounce the gesture — the
    mandatory per-turn reveal can never apply. The revealed index is
    deterministic from board state, so retries bounce forever: a converged
    soft-lock.
  - The AI planner shares the path (`src/battle/ai/use-battle-ai.ts`), so AI
    turns hit the same wall.
  The unit test `battle-events.test.ts:1361-1395` asserts this bounce as
  intended, which is why the suite is green while the behavior is broken.
  Fix direction (pick one, then update that test): (a) planner orders the
  deterministic tail edits before the prompt-opening command (spend before
  play; energy ramp before reveal); or (b) the reducer carries remaining
  gesture commands into the parked state and applies them after the prompt
  resolves. Option (a) is far smaller and keeps the all-or-nothing gesture
  semantics intact.

- **R-P0-2. Random-comparator sort makes shop discounts engine-dependent.**
  `src/shop/shop-generator.ts:416`:
  `slots.map((_, i) => i).sort(() => rng() - 0.5)` runs inside the fold
  (`site-provider.ts` threads `ctx.rng` into `openSite`/`rerollShop`).
  A `sort` with an inconsistent comparator invokes the comparator an
  implementation-defined number of times, so V8 vs JSC consume different
  numbers of rng draws AND produce different permutations. Two clients on
  different browsers folding the same committed `OPEN_SITE` assign
  `discountPercent` to different slots with different values —
  confirmed-fold divergence, detected only by the tripwire and never
  repaired. Every other fold-path shuffle in the file family is proper
  Fisher-Yates; this is the one leftover. Fix: Fisher-Yates over `indices`.

- **R-P0-3. Host-locale `localeCompare` on the `BEGIN_BATTLE` fold path.**
  `src/battle/integration/corpus-opponent-deck.ts:290, 540, 659` tie-break
  with default-locale `localeCompare`; `buildCorpusOpponentDeck` runs inside
  the fold via `battle-init-provider.ts` → `createBattleInit`
  (`create-battle-init.ts:294`). ICU collation differs by locale (e.g.
  `da`/`nb` collate `"aa"` as `"å"`, reachable in lowercase-hex UUIDs), so an
  en-US and a da-DK client folding the same `BEGIN_BATTLE` can sort the
  neutral-dreamsign list differently, pick different dreamsigns, and diverge
  the whole `BattleFoldState`. Same class at
  `src/journey_v2/encounter/generateMerchantEncounter.ts:175` (lower
  practical risk). Fix: plain code-unit comparator
  (`a < b ? -1 : a > b ? 1 : 0`); consider a lint rule banning
  `localeCompare` in fold-reachable code the way `Date.now` is banned in
  `src/rules/`.

### P1 — silent or permanent failure paths

- **R-P1-1. `decodeLogNode` is not total: a corrupt `appliedIndex` throws out
  of the `onValue` callback, freezing the client with no signal.**
  `src/eventlog/subscribe.ts:105` calls
  `decodeAppliedIndex(encoded.appliedIndex)` in the return statement,
  outside the try/catch guarding genesis/baseSnapshot; `decodeAppliedIndex`
  (`src/eventlog/fold.ts:269`) does a bare `JSON.parse(raw)` and then
  dereferences `value.actor`/`value.type` — a non-JSON string, a string
  parsing to `null` (`Object.entries(null)` throws), or `{"5":null}` all
  throw. This violates the module's own "Pure and total: it NEVER throws"
  contract: every `onValue` delivery throws uncaught, `onNode`/`onCorrupt`
  never fire, and at gate time the room degrades to a misleading
  "unreachable" timeout instead of `UnreadableRoomScreen`. The same
  unguarded decode sits inside compaction's try (`append.ts:117`) where it
  is contained — but then feeds R-P1-2. Fix: make `decodeAppliedIndex`
  total (try/catch → empty map; skip non-record values), or move the call
  inside `decodeLogNode`'s try and treat failure as corrupt. Add the missing
  test alongside the existing corrupt-genesis/snapshot/event cases.

- **R-P1-2. Persistently-failing compaction is swallowed with zero
  observability; the log then grows without bound.**
  `src/eventlog/append.ts:138-140` — the compaction `catch {}` is empty: no
  log line, no callback, no counter. Containment is correct (the event still
  commits), but at least three failure modes are permanent and repeat on
  every append forever: a genuine hole below the horizon (nulled event key),
  a corrupt `appliedIndex` (R-P1-1's sibling), or a `baseSnapshot` that
  `config.decode` rejects. Because every append transaction rewrites the
  entire log node, a growth-stuck room's append cost rises monotonically
  until transaction retries start failing submits — with nothing anywhere
  recording that compaction has failed 10,000 times. Fix: `applyAppend`
  can't do IO, so surface it structurally — e.g. persist a
  `compactionFailureCount`/last-error field on the node (updated inside the
  same transaction) that the client logs loudly (journey-log
  `compaction_failing` record) when it crosses a threshold, or have the
  client detect `head - baseSeq > 2×COMPACT_THRESHOLD` and log.

- **R-P1-3. Stale-room eviction deletes actively-played rooms, and victims
  get no signal: frozen UI plus a misleading retry toast forever.**
  `createRoomEvictingStale` (`src/eventlog/room.ts:221-252`) evicts purely by
  `genesis.createdAt` age (>24h) with no presence check, so any third player
  creating a room can null a room two players are actively inside at hour
  25. The victims' subscription receives `null` and `subscribeToLog`
  returns early (`subscribe.ts:127-129`, the "waiting for creation" path),
  so the ready client keeps rendering its last fold; every subsequent
  submit rejects (`appendEvent aborted`) surfacing only as the generic
  "Action failed to send — try again" toast, which can never succeed. Fix:
  (a) check the room's `presence/` node before evicting; (b) in the live
  client, treat a null node after `initialized` as a terminal "room deleted
  — start a new game" state (`hooks.ts` currently wires neither a null-node
  path nor `onCorrupt` on the live subscription — wire both).

- **R-P1-4. Presence is written once and never re-asserted after a transient
  disconnect, permanently defeating the single-AI-runner gate.**
  `writePresence` (`src/eventlog/room.ts:271-282`) arms
  `onDisconnect().remove()` and writes once; nothing subscribes to
  `.info/connected` (verified repo-wide). A two-second network blip deletes
  the entry server-side; the log subscription resumes transparently but the
  presence entry stays gone until a full reload. In a two-human room with
  `aiMode` on, both clients then count 1 connected and BOTH run the battle
  AI (auto-defense dispatches without human approval) — convergent (AI
  writes are ordinary CAS'd events) but a direct violation of the
  one-AI-runner invariant, and the presence pill lies. Fix: subscribe to
  `.info/connected` and rewrite presence (re-arming `onDisconnect`) on each
  reconnect — the standard RTDB presence recipe.

- **R-P1-5. Provider content is environment-dependent: per-client
  fetch-failure fallbacks silently violate the identical-providers
  invariant.** `registerGameProviders` documents that registered content
  must be identical across clients or folds diverge, but `loadJourneyContent`
  (`src/data/journey-content.ts:799-830`) degrades per client on network
  failure: `loadDecklistIds().catch(() => [])`,
  `loadDraftRecords().catch(() => [])`,
  `loadKnownGoodDecklists().catch(() => [])`,
  `loadMerchantCorpus().catch(() => undefined)`. Scenario: client A's
  draft-records fetch fails → its `offerDepsFor` returns `undefined` while
  client B has real deps → the same committed `PICK_DRAFT_CARD` reveals a
  different next offer on each client; same class for `BEGIN_BATTLE`
  opponent decks. Divergence is detected by the tripwire but never repaired.
  Fix: fold-relevant content loads hard-fail (like the card database does)
  and block room entry, or a content-hash joins `ContentConfig` in genesis
  and mismatches gate the room.

- **R-P1-6. "Unknown presence" is unrepresentable at the AI gate's only
  production call site, so the AI runs during reload/join races.**
  `aiMayRunHere` guards `null`/`undefined` (the prior P2-8 fix), but
  `useConnectedCount` initializes to `0` (`src/coop/hooks.ts:120`) and
  `connectedClientCount(null)` returns 0, so `connectedCount === 0` → AI
  enabled before the first presence snapshot lands. Reloading mid-battle in
  a two-player `aiMode` room dispatches enemy auto-defense immediately,
  duplicating the partner-side runner; the symmetric join race (each side
  counting only the other's pending write) also enables both. Fix:
  `useState<number | null>(null)` in the hook and thread `null` through to
  `aiMayRunHere` — the gate module already handles it.

### P2 — converge-but-wrong / integrity holes

- **R-P2-1. The Dream Journey surface violates the architecture wholesale:
  local React state gates commitment, no journey events exist, and random
  outcomes are rolled client-side.**
  (a) `src/journeys/ui/JourneyScreen.tsx:393-422` gates option commitment
  entirely with `useState`/refs; `src/rules/events.ts` has no journey event,
  so nothing folds to the partner until `COMPLETE_SITE`. Both players can
  commit the same option concurrently — each client's deltas
  (`ADJUST_ESSENCE`, card grants) are self-chained intents that apply, so a
  single site can pay out twice. (b)
  `src/journeys/journey/shared/costs.ts:103-105,129-133` and
  `rewards.ts:903-905` roll outcomes with `Math.random()` and ship the
  result in the payload — convergent but unreproducible from the seed, and
  under (a) the two clients roll different outcomes for the same option.
  (c) `costs.ts:114` resolves Nightmare by `card.name` equality — the
  practice AGENTS.md bans outright. Fix: journey traversal/commitment
  becomes events (`COMMIT_JOURNEY_OPTION { nodeId, optionIndex }` folding
  costs/rewards from `ctx.rng` in the reducer); the name lookup becomes a
  UUID. This is the largest remaining chunk of pre-architecture debt.

- **R-P2-2. A false append failure plus a player retry double-applies an
  intent; the log layer has no nonce dedup.**
  `src/eventlog/client.ts:366-379`: an RTDB transaction promise can reject
  after the write reached the server (disconnect between send and ack). The
  committed event arrives by subscription and folds normally; the client
  sweeps the pending intent and toasts "failed — try again". The retry then
  commits a second, fresh-nonce copy of an intent the player meant once —
  both applied, both clients converged, one unintended double-spend.
  Fix options: `applyAppend` consults recent nonces (e.g. the live window)
  and no-ops a duplicate; or `submit` delays the failure toast until the
  subscription confirms the nonce is absent past the transaction's seq
  window. The former is simpler and closes it at the serialization point.

- **R-P2-3. `DEBUG_EDIT` payload fields are unvalidated: `__proto__` as a
  side key mutates `Object.prototype` from inside the fold; non-number
  values corrupt state types.** `coerceBattleCommand`
  (`src/rules/battle/battle-events.ts:640-666`) validates only
  `edit.kind`; `applyDebugEdit` then indexes
  `nextState.sides[edit.side]` with the raw string. A crafted/buggy event
  `{kind:"SET_SCORE", side:"__proto__", value:5}` assigns
  `Object.prototype.score = 5` on every client that folds the log — a
  global mutation escaping the pure fold, returned as `applied`. A string
  `amount` turns `score += "5"` into string concatenation (convergent but
  type-insane state). Fix: whitelist `side` (`"player" | "enemy"`),
  `Number.isFinite` checks on numeric fields, and id-shape checks at
  coercion time.

- **R-P2-4. `LOAD_STATE` can plant an unresolvable `pendingPrompt`, wedging
  the room permanently — the exact state the sanctioned catch exists to
  prevent.** `asValidBattleFoldState`
  (`src/rules/journey/lifecycle.ts:479-493`) validates run cursors but not
  `pendingPrompt.promptId`'s type or `options`' shape. A snapshot whose
  `promptId` is a string applies; `isMatchingResolve` requires a finite
  number, so no resolve can ever match, and CAS rule 4 bounces every
  non-exempt event forever (the catch requires a matching resolve to run).
  Fix: validate `typeof promptId === "number" && Number.isFinite`, the
  prompt `kind`, and the options shape for that kind.

- **R-P2-5. `choice`/`confirm` prompt resolutions are not validated against
  the option list: an out-of-range index silently consumes the prompt and
  the effect is lost.** `coercePromptResolution`
  (`battle-events.ts:817-823`) accepts any integer `optionIndex`;
  `applyPromptResolution` (`effect-runner-core.ts:124-129`) maps
  out-of-range to `{edits: [], rest}` — an applied resolve that closes the
  prompt with no effect. `pick-cards` already gets the strict treatment;
  mirror it: bounce so the prompt stays open for a valid retry.

- **R-P2-6. The divergence tripwire and the dev JSON-safety walker are both
  blind to non-plain containers (Map/Set/Date/class instances).**
  `src/eventlog/hash.ts:52-63` canonicalizes via `Object.keys`, so a
  populated `Map` hashes as `{}` — byte-identical to what a snapshot
  round-trip turns it into — and `assertJsonSafe` (`hash.ts:86-127`) walks
  own keys the same way and passes it clean. A reducer that ever stores a
  `Map` gives a live folder and a snapshot-refolded joiner genuinely
  different states with matching hashes; the joiner's `.get` throws →
  contained bounce → permanent outcome divergence the tripwire cannot see.
  Latent (depends on reducer discipline), but these are the two rails meant
  to catch exactly this. Fix: `assertJsonSafe` rejects any object whose
  prototype is not `Object.prototype`/`Array.prototype`/`null`; optionally
  the same check in `canonicalize` behind dev mode.

- **R-P2-7. The AI dispatches multi-command plans as N separate
  `BATTLE_COMMAND` events rather than one `BATTLE_GESTURE`.**
  `src/battle/ai/use-battle-ai.ts:249-259` (auto-defense) and the approve
  path submit per-command; a foreign event landing mid-sequence bounces the
  tail — the half-applied-gesture class the human path already fixed.
  Benign while the AI runs alone; bites exactly during the R-P1-4/R-P1-6
  gate races when a partner is live. Fix: submit
  `actions.battleGesture(commands)` when length > 1, matching
  `PlayableBattleScreen` (note R-P0-1's resolution must land first or the
  AI inherits that bounce for interactive plays).

### P3 — hygiene and latent traps

- **R-P3-1.** Client-priced events accept pathological costs:
  `PURGE_DECK_CARDS` (`sites.ts:791`) takes `payload.cost` with no
  affordability guard (and clamps negative to 0 silently);
  `REROLL_SHOP` (`shop.ts:251`) lets a negative `essenceCost` *add* essence
  and still pass the `cost > essence` guard. `Math.max(0, …)` plus an
  affordability bounce would match `BUY_SHOP_SLOT`'s rigor.
- **R-P3-2.** `runQueue` (`src/rules/battle/driver.ts:176-243`) has no step
  budget; termination rests on script-table content. A future ▸Materialized
  script whose edits create a scripted character cascades to fresh instance
  ids forever — an identical infinite fold on every client. A generous
  iteration cap that throws (→ containment) turns a future authoring
  mistake from a hang into a bounce.
- **R-P3-3.** `ACCEPT_TRANSFIGURATION_CHOICE` (`sites.ts:569-576`) maps an
  unrecognized `payload.type` to `wantType = null` and applies the *first*
  offered form instead of bouncing — a player can deterministically receive
  a different transfiguration than requested.
- **R-P3-4.** `parseStatOverride`/`parseKeywordModification`/
  `parseTypeChange` (`deck.ts:249,270,293`) accept arrays
  (`typeof [] === "object"`), storing an empty override instead of
  bouncing; `addDreamsign` uses `finiteNumber` where siblings use
  `integer()` (consistency only).
- **R-P3-5.** Dev-only: a reducer throw during the optimistic recompute in
  `submit` (`client.ts:362-364` — `pending.push` + `recomputeDisplayed()`
  sit outside the try) strands the poisoned intent in `pending`; every
  subsequent `onNode → recomputeDisplayed()` rethrows, bricking the tab
  instead of producing one stack trace. Sweep the nonce in a finally-style
  guard around the optimistic fold too.
- **R-P3-6.** Dev/prod containment asymmetry is availability-divergent by
  design (dev fold-halt vs prod bounce on a poison event). Same-build
  pairing means no fold divergence, but a dev tab paired with a deployed
  partner diverges in liveness; the dev client freezes until compaction
  crosses the poison seq, then silently adopts the bounce. Worth a comment
  at `fold.ts`'s devMode and/or a dev-mode terminal surface.
- **R-P3-7.** Write amplification, quantified: every append rewrites
  `head + baseSnapshot + ≤200 events + appliedIndex` (~150–500 KB for a
  mature room), doubled per contention retry, serialized through one
  location; `appliedIndex` grows ~40 B per applied event forever even with
  healthy compaction. Acceptable at prototype lifetimes (as the design
  says) but it compounds R-P1-2, and `appliedIndex` could be pruned to the
  window above `min(basedOnSeq)` of live events if rooms ever live longer.
- **R-P3-8.** `createRoomEvictingStale` downloads the entire `rooms/` tree
  (every room's full log and journey-log mirror) to read each `genesis`
  string (`room.ts:229-231`); a per-child shallow read of
  `rooms/*/log/genesis` scales instead.
- **R-P3-9.** `generateRoomId` (`room.ts:59`) has modulo bias
  (`byte % 33`; 256 % 33 = 25) — first 25 alphabet chars ~14% likelier.
  Entropy nit; also feeds `mintClientId`.
- **R-P3-10.** `logEvent("shop_inventory_generated", …)` runs inside the
  fold (`shop-generator.ts:432`), so every optimistic recompute and every
  client emits reconstruction lines for one committed event —
  `battle-init-provider.ts:63` shows the capture-and-drop pattern to copy.
- **R-P3-11.** `EventLogViewer.tsx:43-47` passes no `onCorrupt`: an
  unreadable room shows "waiting for log..." forever in the one tool built
  to debug broken rooms.
- **R-P3-12.** Submit rejections are inconsistently surfaced: the rethrown
  `submit` rejection and the RESOLVE_PROMPT optimistic-guard refusal
  (`hooks.ts:321-330`) reach callers that `void` the promise → unhandled
  rejections; the resolve-guard refusal is neither toasted nor sinked.
- **R-P3-13.** StrictMode's sequential LogClients share a clientId but each
  restarts `nonceCounter` at 0 (`client.ts:334`); client #2's first nonce
  can collide with client #1's committed event and strip the wrong pending
  echo. Dev-only, tiny window; a random component in the nonce closes it.
- **R-P3-14.** Journey-log-sink completeness claims overstate: an appender
  closing its tab before folding its own confirm leaves that event mirrored
  by nobody, and after a rewind `mirroredHighWater` suppresses re-mirroring
  rewritten own events. Best-effort is fine — soften the header claim or
  add a catch-up sweep.
- **R-P3-15.** `RoomGate.tsx:272-282` presence effect returns no cleanup
  (stale entry persists on a room switch), and RoomGate + CoopProvider
  duplicate the presence subscription.
- **R-P3-16.** `src/battle/integration/battle-completion-bridge.ts` (module
  state `completedBattleIds`) has no production caller — deletable legacy
  that still reads as a local-state game gate to anyone grepping for the
  pattern.
- **R-P3-17.** Dev-StrictMode can strand a ref-guarded bootstrap intent
  (`BattleSiteRoute.tsx` `beginRequestedKeyRef` survives the simulated
  remount whose provider cleanup rejected the queued `BEGIN_BATTLE`) —
  "Preparing battle…" forever in dev. Key the guard to the provider
  instance or resubmit on rejection.

## Test coverage gaps (consolidated)

The spec's §Testing matrix is mostly satisfied (engine invariants, poison
containment, echo reconciliation, real-reducer emulator storm with
compaction and a post-compaction joiner, all wired into CI). What's missing,
in value order:

1. **Battle-phase chaos storm.** The real-reducer concurrent storm
   (emulator scenario D) is journey-only: no `BEGIN_BATTLE`,
   `BATTLE_COMMAND`, `BATTLE_GESTURE`, `RESOLVE_PROMPT`, or `END_BATTLE`
   ever flows through two concurrent clients in any test. Battle carries
   the prompt gate, trigger queue, and dreamwell — the highest-risk
   convergence surface. Extend scenario D (or add E) to storm battle
   events, with both clients firing `RESOLVE_PROMPT` (matching and wrong
   promptIds) whenever a prompt is open. This storm would have caught
   R-P0-1 immediately.
2. **Two-actor ordering-convergence property sweep (pure fold, in
   `npm test`).** `journey-properties.test.ts` runs 100 seeds but single
   actor, always-fresh `basedOnSeq` — it never trips CAS staleness, partner
   windows, or compaction horizons. Add a two-actor variant with randomized
   stale `basedOnSeq` asserting fold-vs-compact-at-k equivalence with the
   real reducer (today that equivalence is toy-only).
3. **Real-session replay fixture.** All three fixtures are synthetic and
   6–9 events long on fake providers. Record one genuine two-player session
   log (the viewer/sink already have the shape) and check it in with its
   hash; at minimum add a long synthetic fixture (>COMPACT_THRESHOLD,
   multi-actor, battle included).
4. **Prompt raced through the full LogClient path.** The prompt race exists
   only as a pure reducer test; drive two `createLogClient`s on one
   in-memory log with the real config, race `RESOLVE_PROMPT`, assert one
   applies + loser's echo rolls back + hashes match.
5. **LOAD_STATE under concurrency and across compaction.** Client A loads a
   snapshot while B streams stale intents; assert B bounces, both converge,
   and a post-compaction joiner matches.
6. **Edge-decode cases from this audit:** corrupt `appliedIndex`
   (R-P1-1), null node after `initialized` (R-P1-3), a Map-bearing state
   through hash/walker (R-P2-6), presence after reconnect (R-P1-4),
   array-shaped `events` fed to `applyAppend`.

## Prioritized task list

Suggested sequencing; sizes are rough.

1. **[R-P0-1] Unbreak interactive plays/reveals** — reorder planner tail
   edits before the prompt-opening command (planCardPlay,
   planDreamwellReveal), update the mid-gesture-prompt test to cover the
   new shape, add a reducer test "cost-bearing interactive play applies and
   parks its prompt", and browser-QA an interactive card play. (S–M)
2. **[R-P0-2, R-P0-3] Kill the two nondeterminism leaks** — Fisher-Yates in
   shop-generator; code-unit comparators in corpus-opponent-deck and
   generateMerchantEncounter; add a lint restriction on `localeCompare` and
   comparator-less/inconsistent `sort` for fold-reachable dirs; regenerate
   replay fixtures. (S)
3. **[R-P1-1, R-P1-3, R-P1-2] Total decode + terminal room states +
   compaction observability** — total `decodeAppliedIndex`; null-node and
   onCorrupt handling on the live subscription with a terminal screen;
   presence-checked eviction; a `compaction_failing` signal. (M)
4. **[R-P1-4, R-P1-6, R-P2-7] Fix the AI-runner gate for real** —
   `.info/connected` presence re-assertion, `null`-initialized
   connectedCount, AI submits gestures. (S–M)
5. **[R-P1-5] Pin fold-relevant content** — hard-fail fold-relevant content
   loads (or hash them into genesis ContentConfig). (S)
6. **[R-P2-2..R-P2-6] Integrity hardening batch** — nonce dedup at append,
   DEBUG_EDIT field validation, LOAD_STATE prompt validation, choice/confirm
   resolution validation, prototype check in assertJsonSafe. (M)
7. **[R-P2-1] Journey events migration** — the last pre-architecture
   surface: journey commitment as events, rng-derived outcomes in the
   reducer, UUID lookup. (L — its own plan)
8. **[Tests 1–6 above] Convergence coverage** — battle chaos storm first;
   it retroactively guards items 1–6. (M)
9. **[R-P3-*] Hygiene tail** as opportunity allows; R-P3-1/2/3 (cost
   guards, step budget, transfiguration type bounce) are the ones with
   player-visible consequences. (S each)

## Closing assessment

Against the stated goal — "two players taking essentially random actions
overlapping concurrently, in any order, resilient, always internally sane,
simulation exactly once" — the architecture delivers: the log is the single
source of truth, the fold is pure, CAS + prompt gating + exactly-once
markers are correct, and the historical dreamwell double-apply class is
structurally closed. The findings above are (a) one composition bug between
two individually-correct hardening fixes (R-P0-1), (b) two classic
nondeterminism leaks that slipped past the rng discipline because they hide
inside `sort` (R-P0-2/3), (c) missing edge-of-system signals (decode
totality, eviction, presence, compaction health), and (d) one legacy surface
(journeys) that predates the architecture. None undermine the design; all
are closeable within it.
