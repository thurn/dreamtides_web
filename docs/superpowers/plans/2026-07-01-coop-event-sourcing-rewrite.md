# Coop Event-Sourcing Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the quest prototype's coop multiplayer with the event-sourced "shared log, local fold" architecture: clients append intent events to a totally-ordered RTDB log; every client folds the log with a pure reducer; all simulation lives in the reducer; no legacy sync code survives.

**Architecture:** Three packages with strict dependency direction — `src/eventlog/` (game-agnostic append/fold/compaction/echo engine parameterized by a reducer), `src/rules/` (pure game reducer: quest events, battle events, fold-time effect engine), `src/coop/` (thin React layer). Big-bang cutover; undo removed; no Firebase data compatibility.

**Tech Stack:** TypeScript, React, Vite, Vitest, Firebase RTDB (+ emulator), ESLint flat config.

**Authoritative documents:** the spec `docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md` (all type shapes: `GameEvent`, `Genesis`, `EngineConfig`, `FoldState`, `BattleFoldState`, `EffectRun`, `PendingPrompt`, the CAS policy, the RTDB schema) and the proposal `docs/quest_prototype/coop_event_sourcing_proposal.md`. When this plan says "per spec §X", the spec section is the contract — do not re-derive it.

**Execution rules for every task:**
- Per AGENTS.md: commit with a detailed message **and `git push`** at the end of every task. Work on `master`; do not create branches.
- Every commit must pass `npm run lint`, `npm run typecheck`, `npm test`. Stages A–C are purely additive, so the app keeps working. Stages D–E rewire and delete; individual commits there may leave the app mid-cutover but must keep all three checks green. Production deploy (`npm run deploy`) happens only after Task 30, and only if the user asks.
- Identify cards by UUID everywhere. Any map/set keyed by card name is a bug.
- If you hit a pre-existing issue, describe it in `./pre-existing-issues.txt` and include it in the commit.
- Test files are colocated next to sources (`foo.ts` → `foo.test.ts`), matching the repo convention.

---

## File structure

```
src/eventlog/                    # Stage A — game-agnostic engine (no Dreamtides imports)
  types.ts        types.test.ts      # GameEvent, Genesis, LogNode, EngineConfig, EventContext, EventOutcome
  rng.ts          rng.test.ts        # per-event random stream keyed (seed, seq, drawIndex)
  hash.ts         hash.test.ts       # canonical stable-stringify + SHA-256 state hash
  fold.ts         fold.test.ts       # pure fold driver: intervening actors, outcomes, incremental fold
  append.ts       append.test.ts     # pure append/compaction updater + RTDB runTransaction wrapper
  subscribe.ts                       # onValue on log/, decode, ordered delivery
  client.ts       client.test.ts     # stateful LogClient: confirmed fold + pending queue + optimistic echo
  room.ts         room.test.ts       # room ids, create-with-eviction, presence, genesis write
  emulator.integration.test.ts       # two-client convergence against the RTDB emulator

src/rules/                       # Stage B/C — pure reducer (lint-banned: firebase, react, Math.random, Date.now)
  events.ts                          # discriminated union of every event type (table below)
  fold-state.ts                      # FoldState + genesisFoldState(genesis)
  reducer.ts      reducer.test.ts    # root fold: CAS policy → domain routing
  quest/
    lifecycle.ts   lifecycle.test.ts # START_QUEST, RESET_QUEST, LOAD_STATE, SELECT_DREAM_AVATAR, screens/travel
    deck.ts        deck.test.ts      # deck, transfiguration, dreamsign events
    draft.ts       draft.test.ts     # PICK_DRAFT_CARD, SET_DRAFT_STATE
    sites.ts       sites.test.ts     # OPEN_SITE generation + site interaction events
    shop.ts        shop.test.ts      # shop, merchant, modifier events
  battle/
    (relocated intact: apply-debug-edit.ts, battle-card-effects-table.ts,
     dreamwell-effects-table.ts, effect-runner-core.ts, rules-text-hash.ts,
     basic-automation.ts and their existing test suites)
    fold.ts        fold.test.ts      # BattleFoldState, EffectRun/PendingPrompt cursors
    driver.ts      driver.test.ts    # advanceEffectQueue: cursor → plan → apply/park
    battle-events.ts battle-events.test.ts # BEGIN/END_BATTLE, BATTLE_COMMAND triggers, RESOLVE_PROMPT
  replay/
    replay.ts      replay.test.ts    # fold a recorded log, assert final hash
    fixtures/                        # checked-in { genesis, events, finalHash } JSON files
    regenerate-fixtures.mjs          # re-stamp fixture hashes after intentional reducer changes

src/coop/                        # Stage D — React layer
  build-hash.ts                      # __BUILD_HASH__ accessor (env fallback for tests)
  RoomGate.tsx                       # create/join, presence, subscribe, version gate, log sink
  hooks.ts                           # useGameState(), useAppend(), useConnectedCount()
  actions.ts      actions.test.ts    # named action creators mirroring legacy QuestMutations
  BounceToast.tsx                    # "your partner acted first" notification
  VersionGateScreen.tsx              # read-only new-version state
  EventLogViewer.tsx                 # ?viewLogs= viewer over the event log
  quest-log-sink.ts                  # minimal rewrite of the JSONL sink → rooms/{id}/logs
```

Deleted in Stage E (full inventory in Task 28): all of `src/multiplayer/`, `src/state/multiplayer-quest-context.tsx`, `src/state/multiplayer-battle-context.tsx`, `src/state/use-ensure-battle-session.ts`, `src/state/quest-state-invariants.ts`, `src/battle/automation/use-battle-effect-runner.ts`, `src/battle/automation/use-dreamwell-effect-runner.ts`, `src/battle/state/history.ts`, and their tests.

---

## Legacy mutation → event mapping (the authoritative table)

Every multiplayer mutation in `src/state/multiplayer-quest-context.tsx` maps to exactly one row. Payload fields mirror the legacy mutation's parameters (UUIDs and indices only — never card names) unless a note says the reducer now derives the value. Rows marked *(debug)* are debug/QA-only surface and keep working.

**Consolidations** (approved in spec): the five `ensure*SiteRuntime` writers collapse into `OPEN_SITE` (generation moves in-reducer, drawn from `ctx.rng`); the four add-card variants collapse into `ADD_CARD` with option fields; `setDeckEntryTypeChange`/`changeDeckEntryType` collapse into `SET_DECK_ENTRY_TYPE`; the QA bootstraps compose `LOAD_STATE` (+ `BEGIN_BATTLE` for start-in-battle) on the client.

| Legacy mutation | Event type | Payload / reducer notes |
|---|---|---|
| changeEssence | `ADJUST_ESSENCE` | `{ delta }`; clamp to `[0, essenceCap]` |
| setEssence *(debug)* | `SET_ESSENCE` | `{ value }` |
| changeMaxEssence | `ADJUST_ESSENCE_CAP` | `{ delta }`; re-clamp essence |
| setEssenceCap *(debug)* | `SET_ESSENCE_CAP` | `{ value }` |
| setMaxDreamsigns *(debug)* | `SET_MAX_DREAMSIGNS` | `{ value }` |
| setCompletionLevel *(debug)* | `SET_COMPLETION_LEVEL` | `{ value }` |
| startQuest | `START_QUEST` | payload mirrors legacy args; initial state built via `ctx.rng` |
| resetQuest | `RESET_QUEST` | `{}`; resets to genesis quest state, clears battle |
| loadQuestState / bootstrapQaScene *(debug)* | `LOAD_STATE` | `{ snapshot: FoldState["quest"], battle?: BattleFoldState }`; large payload is fine, compaction absorbs it |
| bootstrapStartInBattle *(debug)* | `LOAD_STATE` then `BEGIN_BATTLE` | client appends both |
| setDream AvatarSelection | `SELECT_DREAM_AVATAR` | `{ dreamAvatarId }`; reducer derives `resolvedPackage` and `remainingDreamsignPool` deterministically from the UUID and the folded `quest.seed` (= `genesis.seed`, identical on every client) via the `QuestLifecycleContentProvider`, instead of trusting a client-computed package |
| setScreen | `SET_SCREEN` | `{ screen, activeSiteId }` |
| setCurrentDreamscape | `TRAVEL_TO_DREAMSCAPE` | `{ nodeId }`; visitedSites + dreamscapeModifiers decrement in-case |
| markSiteVisited | `MARK_SITE_VISITED` | `{ siteId }` |
| dismissStartingDeckPopup | `DISMISS_STARTING_DECK_POPUP` | `{}` |
| addCard / addCardById / addCardByIdWithTransfiguration / addBaneCardById | `ADD_CARD` | `{ cardId, transfiguration?, isBane?, source? }` |
| removeDeckEntry | `REMOVE_DECK_ENTRY` | `{ entryId }` |
| purgeDeckCards | `PURGE_DECK_CARDS` | `{ entryIds }` |
| duplicateDeckEntry | `DUPLICATE_DECK_ENTRY` | `{ entryId }` |
| setDeckEntryStatOverride *(debug)* | `SET_DECK_ENTRY_STAT_OVERRIDE` | `{ entryId, override }` |
| setDeckEntryKeywords *(debug)* | `SET_DECK_ENTRY_KEYWORDS` | `{ entryId, keywords }` |
| setDeckEntryTypeChange / changeDeckEntryType | `SET_DECK_ENTRY_TYPE` | `{ entryId, typeChange }` |
| transfigureCard | `TRANSFIGURE_CARD` | `{ entryId, transfiguration }` |
| acceptTransfigurationChoice | `ACCEPT_TRANSFIGURATION_CHOICE` | `{ siteId, entryId }`; marks siteRuntime accepted |
| acceptDuplicationChoice | `ACCEPT_DUPLICATION_CHOICE` | `{ siteId, entryId }` |
| purgeAllBaneCards | `PURGE_ALL_BANE_CARDS` | `{}` |
| purgeRandomBaneCards | `PURGE_RANDOM_BANE_CARDS` | `{ count }`; selection via `ctx.rng` |
| addDreamsign | `ADD_DREAMSIGN` | `{ dreamsignId }` |
| removeDreamsign | `REMOVE_DREAMSIGN` | `{ dreamsignId }` |
| setRemainingDreamsignPool *(debug)* | `SET_DREAMSIGN_POOL` | `{ ids }` |
| setDreamsignIsBane | `SET_DREAMSIGN_IS_BANE` | `{ dreamsignId, isBane }` |
| setDraftState *(debug)* | `SET_DRAFT_STATE` | `{ draftState }` |
| pickDraftCard | `PICK_DRAFT_CARD` | `{ packIndex, cardId }` |
| ensureRewardSiteRuntime / ensureDreamsignOfferRuntime / ensureEssenceSiteRuntime / ensureCardChoiceRuntime / ensureShopRuntime | `OPEN_SITE` | `{ siteId }`; reducer generates the site runtime for the site's type from `ctx.rng` and stores it; if runtime already exists the event is a no-change **applied** (idempotent — both players opening simultaneously must not toast) |
| completeDreamAugurySite | `COMPLETE_DREAM_AUGURY` | `{ siteId }` |
| acceptRewardSite | `ACCEPT_REWARD` | `{ siteId }` (+ choice index if legacy signature carries one) |
| acceptDreamsignOffer | `ACCEPT_DREAMSIGN_OFFER` | `{ siteId, dreamsignId }` |
| rejectDreamsignOffer | `REJECT_DREAMSIGN_OFFER` | `{ siteId }` |
| acceptEssenceSite | `ACCEPT_ESSENCE` | `{ siteId }` |
| rerollDreamAugury *(debug)* | `REROLL_DREAM_AUGURY` | `{ siteId }`; redraw from `ctx.rng` at this event's seq |
| forceDreamAuguryArchetype *(debug)* | `FORCE_DREAM_AUGURY_ARCHETYPE` | `{ siteId, archetypeId }` |
| completeSite | `COMPLETE_SITE` | `{ siteId }` |
| acceptDreamMerchantOffer | `ACCEPT_MERCHANT_OFFER` | `{ siteId }` + the legacy offer payload (effects applied in-case) |
| declineDreamMerchant | `DECLINE_MERCHANT` | `{ siteId }` |
| buyShopSlot | `BUY_SHOP_SLOT` | `{ siteId, slotIndex }`; insufficient essence → bounce |
| rerollShop | `REROLL_SHOP` | `{ siteId }`; consumes freeRerolls first; redraw via `ctx.rng` |
| grantFreeShopRerolls | `GRANT_FREE_REROLLS` | `{ count }` |
| applyShopEssenceDiscount | `APPLY_SHOP_DISCOUNT` | `{ percent }` |
| pushBattleRewardModifier | `PUSH_BATTLE_MODIFIER` | `{ modifier }` |
| pushTemporaryBaneGrant | `PUSH_TEMPORARY_BANE_GRANT` | payload mirrors legacy args |
| removeSiteTypeFromNextDreamscapes | `BAN_SITE_TYPE` | `{ siteType, dreamscapesRemaining }` |
| boostSiteAppearance | `BOOST_SITE_APPEARANCE` | `{ siteType, percent, dreamscapesRemaining }` |
| replaceSiteType | `REPLACE_SITE_TYPE` | `{ nodeId, fromSiteType, toSiteType }` |
| addSiteToDreamscape | `ADD_SITE_TO_DREAMSCAPE` | `{ nodeId, siteType }` |
| updateAtlas *(debug)* | `UPDATE_ATLAS` | `{ atlas }` |
| setCardSourceDebug *(debug)* | `SET_CARD_SOURCE_DEBUG` | `{ state }` |
| incrementCompletionLevel | `END_BATTLE` | `{ result: "victory" }`; reducer bumps completionLevel, sets screen, decrements battleModifiers, applies deck changes, clears `state.battle` |
| setFailureSummary | `END_BATTLE` | `{ result: "defeat" }`; reducer derives the failure summary from the battle fold state. If a non-battle caller of setFailureSummary exists, it maps to `QUEST_FAILED { summary }` |

Battle events (new, no legacy 1:1): `BEGIN_BATTLE { siteId }`, `BATTLE_COMMAND { command: BattleCommand }` (the existing command type wrapping `BattleDebugEdit` / force-result), `RESOLVE_PROMPT { promptId, resolution: PromptResolution }`, `SET_CARD_NOTE { instanceId, note }` (CAS-exempt, alongside `OPEN_SITE`).

---

## Stage A — the eventlog engine

### Task 1: Scaffold packages and purity lint rails

**Files:**
- Create: `src/eventlog/`, `src/rules/`, `src/coop/` (directories, with a placeholder `types.ts` in eventlog so lint has a target)
- Modify: `eslint.config.js`

The lint rails are the architectural enforcement from the spec and must exist before any rules code is written.

- [ ] **Step 1: Add lint rules.** In `eslint.config.js`, add a config block scoped to `src/rules/**` that errors on: imports of `firebase/*` and `react` (`no-restricted-imports`), and `Math.random` / `Date.now` / argless `new Date()` (`no-restricted-properties` / `no-restricted-syntax`). Add a block scoped to `src/eventlog/**` banning imports from `src/rules/**` and `src/coop/**` (the engine must stay game-agnostic).
- [ ] **Step 2: Verify the rail fires.** Temporarily add `Math.random()` to a scratch file in `src/rules/`, run `npm run lint`, confirm it errors, delete the scratch line, confirm lint passes.
- [ ] **Step 3: Commit and push.**

### Task 2: `src/eventlog/types.ts` — engine contracts

**Files:** Create: `src/eventlog/types.ts`

- [ ] **Step 1: Write the types.** Transcribe from spec §Architecture and §Data model: `GameEvent`, `Genesis` (`{ seed, reducerVersion, createdAt }`), `LogNode` (decoded: `{ genesis, baseSeq, baseSnapshot, head, events }`), `EncodedLogNode` (the RTDB shape: genesis/baseSnapshot/events values are JSON strings), `EventOutcome = "applied" | "bounced"`, `EventContext` (`{ seq, rng: (drawIndex: number) => number, intervening: Array<{seq, actor, type}> | "unknown", timestamp: string }`), and `EngineConfig<S>` exactly as the spec defines it, including that `intervening` carries only events that themselves **applied** (bounced events never invalidate a later decision) and is `"unknown"` (string literal) when `basedOnSeq < baseSeq` — so reducers can't accidentally treat an empty array as unknown — and the optional `nonce?: string` on `GameEvent`, stamped by the client on submit and ignored by reducers (Task 7 uses it to match confirmed events against the pending-intent queue).
- [ ] **Step 2: `npm run typecheck` passes. Commit and push.**

### Task 3: `src/eventlog/rng.ts` — seq-keyed random stream

**Files:** Create: `src/eventlog/rng.ts`, `src/eventlog/rng.test.ts`

`eventRng(seed: string, seq: number): (drawIndex: number) => number` returning uniform [0, 1). Implementation: the SHA-256 salted-digest pattern from `src/journey_v2/signals/rng.ts` (`merchantRng`), salted `"${seed}|${seq}|${drawIndex}"`. Do not import from journey_v2 (that would couple engine → game); reimplement the ~10-line pattern using the same sha256 dependency.

- [ ] **Step 1: Write failing tests.** Bug classes: nondeterminism (same (seed, seq, drawIndex) twice → identical value); stream collision (different seq or drawIndex → different values for at least 99 of 100 sampled triples); range violation (1,000 draws all in [0, 1)).
- [ ] **Step 2: Run `npx vitest run src/eventlog/rng.test.ts` — expect FAIL (module missing).**
- [ ] **Step 3: Implement. Run again — expect PASS.**
- [ ] **Step 4: Commit and push.**

### Task 4: `src/eventlog/hash.ts` — canonical state hash

**Files:** Create: `src/eventlog/hash.ts`, `src/eventlog/hash.test.ts`

`hashState(value: unknown): string` — stable stringify with recursively sorted object keys, then SHA-256 hex. Used for `stateHashAfter` and replay assertions.

- [ ] **Step 1: Failing tests.** Bug classes: key-order sensitivity (`{a,b}` vs `{b,a}` must hash equal); missed difference (one deep field changed → different hash); array-order sensitivity is *intended* (reordered array → different hash — pin this so nobody "fixes" it).
- [ ] **Step 2–4: Red → implement → green → commit and push.**

### Task 5: `src/eventlog/fold.ts` — pure fold driver

**Files:** Create: `src/eventlog/fold.ts`, `src/eventlog/fold.test.ts`

Exports (pure, no IO):
- `foldEvents<S>(config, genesis, base: {seq, state}, events: Array<{seq, event}>): { state: S; lastSeq: number; outcomes: Array<{seq, event, outcome}> }` — folds in seq order, computing each event's `intervening` (entries `{seq, actor, type}`) from the **applied** events it has already seen this fold — bounced events are excluded per spec — **plus** a supplied `appliedBySeq` index for earlier live events; when `event.basedOnSeq < baseSeq`, passes `"unknown"`. Outside dev, each reducer call is wrapped: a throw yields outcome `bounced` plus an error report through the outcomes array (spec §Safety rails, poison-event containment); dev rethrows.
- `buildAppliedIndex(events, outcomes): Map<number, {actor: string, type: string}>` — helper the client uses to answer intervening queries across incremental folds (applied events only).

Test with a **toy reducer** (e.g. counter state `{n, log[]}` where event `ADD {x}` applies unless bounced) — no game imports. Bug classes:
- **Wrong intervening window:** event with `basedOnSeq = 3` at seq 6 must see exactly seqs 4–5; off-by-one on either end is the bug.
- **Self-chain miscomputation:** actor A appends seqs 4,5,6 all `basedOnSeq: 3` with no partner events — reducer receives only A-actored intervening entries (the toy reducer applies; the real CAS policy is Stage B, but the *data* must be right here).
- **Bounced-event echo:** a partner event that itself bounced at seq 4 must not appear in any later event's intervening window.
- **Poison containment:** a toy reducer that throws on one event type yields outcome bounced for that event, applied for the rest, and one error report — no throw escapes the fold (dev-mode flag off).
- **Snapshot-horizon leak:** `basedOnSeq < baseSeq` must yield `"unknown"`, not an empty array.
- **Determinism:** folding the same inputs twice yields identical state and identical `hashState` output.
- **Incremental ≡ batch:** folding events [1..10] at once equals folding [1..5] then [6..10] on top (pins the incremental-fold contract the client relies on).

- [ ] **Step 1: Write failing tests for the bug classes above.**
- [ ] **Step 2: Red. Step 3: Implement. Step 4: Green (`npx vitest run src/eventlog/fold.test.ts`).**
- [ ] **Step 5: Commit and push.**

### Task 6: `src/eventlog/append.ts` — append + in-transaction compaction

**Files:** Create: `src/eventlog/append.ts`, `src/eventlog/append.test.ts`

Two layers:
1. **Pure updater** `applyAppend<S>(config, encoded: EncodedLogNode, event: GameEvent): EncodedLogNode` — decodes, sets `head += 1`, `events[head] = encodeEvent(event)`, and when `head - baseSeq > COMPACT_THRESHOLD` (constant, 200) folds the oldest events down to `head - COMPACT_TARGET` (constant, 100) into `baseSnapshot` via `config.reducer`/`config.encode`, advances `baseSeq`, deletes the folded events. Exported so it is unit-testable without Firebase.
2. **IO wrapper** `appendEvent(db, roomId, config, event)` — `runTransaction` on `rooms/{roomId}/log` applying the pure updater; returns the committed seq (from the transaction snapshot).

- [ ] **Step 1: Failing tests for the pure updater.** Bug classes: **compaction changes meaning** — for a toy reducer, `fold(genesis, allEvents)` must equal `fold(decode(baseSnapshot), liveEvents)` after compaction triggers (the single most important invariant in the engine); **sparse keys** — after compaction, `events` contains exactly the dense integer keys `(baseSeq, head]`; **premature compaction** — no compaction at exactly `COMPACT_THRESHOLD` live events, compaction at `COMPACT_THRESHOLD + 1`.
- [ ] **Step 2–4: Red → implement → green.**
- [ ] **Step 5: Commit and push.**

### Task 7: `src/eventlog/subscribe.ts` + `src/eventlog/client.ts` — subscription and the stateful LogClient

**Files:** Create: `src/eventlog/subscribe.ts`, `src/eventlog/client.ts`, `src/eventlog/client.test.ts`

`subscribe.ts`: thin `onValue` wrapper on `log/` that decodes `EncodedLogNode` → `LogNode` and invokes a callback. No local state. An event string that fails to decode, or whose `basedOnSeq` is nonsensical (negative, or ≥ its own seq), is surfaced as a pre-bounced no-op per spec §Safety rails — decode never throws.

`client.ts`: `createLogClient<S>(config, io, callbacks)` where `io` abstracts `{ subscribe, append }` (so tests inject fakes — no Firebase in unit tests). Responsibilities, per spec §Optimistic echo and §Read path:
- Maintain `(lastFoldedSeq, confirmedState)`; fold new events incrementally; full re-fold from `baseSnapshot` when `baseSeq` advances past `lastFoldedSeq` or on resubscribe.
- Maintain the ordered pending-intent queue; `submit(eventDraft)` stamps `basedOnSeq` = last *confirmed* seq, folds optimistically at predicted seq, calls `callbacks.onDisplayState(displayed)`.
- On confirmed events: remove own committed intents from pending (match by a client-generated nonce field carried in the event payload envelope — decision fixed here: the client wraps payloads as `{ nonce, ...payload }`? **No** — cleaner and fixed here: match by `(actor, basedOnSeq, type)` is ambiguous, so the engine adds an optional top-level `GameEvent.nonce?: string` stamped by `submit()`; reducers must ignore it), re-fold pending on top of the new confirmed state, emit `onDisplayState`.
- Emit `callbacks.onEventOutcome(event, seq, outcome)` for every confirmed event.
- **Divergence tripwire (spec §Safety rails):** when a confirmed event carries `stateHashAfter` and it disagrees with `hashState` of this client's own fold at that seq, emit `callbacks.onDivergence({ seq, expected, actual })` (Task 24 logs it as `fold_divergence`).
- Compute `stateHashAfter`: included on submit only when the predicted seq is `lastConfirmedSeq + 1` and the pending queue is empty (spec §Safety rails).

- [ ] **Step 1: Failing tests (fake io, toy reducer).** Bug classes: **echo not rolled back** — partner event wins the predicted seq, own intent re-folds after it and (toy CAS) bounces → displayed state must drop the echo and `onEventOutcome` must report the bounce; **double-apply of own intent** — own event confirmed at seq n while still in pending → displayed state must contain it exactly once; **refold-after-compaction** — baseSeq advances past lastFoldedSeq → client re-folds from snapshot and displayed state matches batch fold; **hash gating** — `stateHashAfter` absent when pending queue was non-empty at submit; **divergence not detected** — a confirmed event carrying a wrong `stateHashAfter` triggers exactly one `onDivergence` with that seq.
- [ ] **Step 2–4: Red → implement → green.**
- [ ] **Step 5: Commit and push.**

### Task 8: `src/eventlog/room.ts` — room lifecycle

**Files:** Create: `src/eventlog/room.ts`, `src/eventlog/room.test.ts`

Rewrite (from scratch, same observable behavior as legacy): `generateRoomId`/`isValidRoomId`/`normalizeRoomId` (6-char lowercase alphanumeric, 4–24 valid range); `createRoom(db, roomId, genesis)` writing `log/` (genesis JSON string, `baseSeq: 0`, `baseSnapshot: null`, `head: 0`, no events) in one multi-path update; stale-room eviction (delete rooms with `genesis.createdAt` older than 24h, preserve unparseable) folded into `createRoomEvictingStale`; `writePresence(db, roomId, clientId)` with `onDisconnect` cleanup; `connectedClientCount(presence)`; `mintClientId()` generating a fresh id per tab/connection, never persisted per browser — the self-chain CAS exemption assumes one optimistic view per actor, which two tabs sharing an id would violate.

- [ ] **Step 1: Failing tests** for the pure parts. Bug classes: id alphabet/length violations round-tripping `isValidRoomId(generateRoomId())`; eviction boundary (23h room preserved, 25h room evicted, unparseable preserved — pins the preservation rule so eviction never eats live rooms).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 9: Emulator integration test

**Files:** Create: `src/eventlog/emulator.integration.test.ts`

Follow the harness pattern of the existing `src/multiplayer/firebase-emulator.integration.test.ts` (RTDB emulator connection; see `scripts/dev-with-emulator.mjs` for how the emulator is launched locally) — copy the connection setup before that file is deleted in Stage E.

- [ ] **Step 1: Write the test.** Two `createLogClient` instances on one room, toy reducer. Scenario A (**convergence**): both clients concurrently append 20 interleaved events; assert both settle on identical `hashState(confirmedState)` and identical `lastFoldedSeq`. Scenario B (**compaction under contention**): append past `COMPACT_THRESHOLD` from both clients; assert convergence and that `events` node stayed ≤ threshold. Scenario C (**chaos storm**, spec §Testing): with a seeded PRNG, each client fires ~100 random intents (mixing valid, invalid-in-state, and stale-`basedOnSeq` events) at random small delays, concurrently; assert both clients converge to identical `hashState(confirmedState)`, dense seqs, and zero thrown errors. Bug class: transaction retry losing or reordering events — exactly `head` events observed, dense seqs.
- [ ] **Step 2: Run it against the emulator — expect PASS.** If the emulator harness can't run in this environment, mark the test with the same skip-guard the legacy integration test uses and note it in the commit message.
- [ ] **Step 3: Commit and push.**

---

## Stage B — rules: quest domain

### Task 10: `fold-state.ts`, `events.ts`, root reducer with CAS policy

**Files:** Create: `src/rules/fold-state.ts`, `src/rules/events.ts`, `src/rules/reducer.ts`, `src/rules/reducer.test.ts`

- `fold-state.ts`: `FoldState` per spec (quest + battle, no undo), `genesisFoldState(genesis)` producing the pre-quest state (the state a fresh room shows before `START_QUEST` — mirror what legacy `createRoom` seeded as the initial `questState`).
- `events.ts`: the discriminated union. Add every type from the mapping table now, each with its payload interface; domain cases land per-task and until then unknown-to-the-router types **bounce** (never throw).
- `reducer.ts`: `reduceGameEvent(state, event, ctx): { state, outcome }` implementing spec §Root fold and CAS policy rules 1–6 verbatim: CAS-exempt check (`SET_CARD_NOTE` and `OPEN_SITE`) → matching-`RESOLVE_PROMPT` fast path → intervening/unknown bounce (ignoring decision-neutral types: `SET_CARD_NOTE`) → prompt gate → domain routing → invalid-intent bounce. The reducer must never throw on any event content.

- [ ] **Step 1: Failing tests for the policy** (use `ADJUST_ESSENCE` as the probe event once its case exists — write these tests against a minimal `ADJUST_ESSENCE` case implemented in this task as the first domain case). Bug classes: **partner-intervening applied** (event with an applied partner seq in the window must bounce even if it would be valid); **note is decision-neutral** (an applied partner `SET_CARD_NOTE` in the window must not bounce an unrelated intent); **self-chain bounced** (own-actor-only window must apply); **unknown window applied** (`intervening: "unknown"` must bounce); **prompt gate leak** (with `pendingPrompt` set, `ADJUST_ESSENCE` bounces, matching `RESOLVE_PROMPT` is routed); **CAS-exempt discipline** (`SET_CARD_NOTE` applies through both a partner window and an open prompt); **throw on garbage** (an event with `type: "NOT_A_REAL_TYPE"` and payload `null` returns a bounce, does not throw).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 11: Quest lifecycle, essence, navigation events

**Files:** Create: `src/rules/quest/lifecycle.ts`, `src/rules/quest/lifecycle.test.ts`; Modify: `src/rules/reducer.ts` (routing)

Implement the reducer cases for: `START_QUEST`, `RESET_QUEST`, `LOAD_STATE`, `SELECT_DREAM_AVATAR`, `SET_SCREEN`, `TRAVEL_TO_DREAMSCAPE`, `MARK_SITE_VISITED`, `DISMISS_STARTING_DECK_POPUP`, `SET_ESSENCE`, `ADJUST_ESSENCE`, `SET_ESSENCE_CAP`, `ADJUST_ESSENCE_CAP`, `SET_MAX_DREAMSIGNS`, `SET_COMPLETION_LEVEL`. **Method:** for each, locate the legacy mutation body in `src/state/multiplayer-quest-context.tsx` (grep by mutation name), move its domain math into a pure function taking `(quest, payload, ctx)`, and drop the transaction/normalization/actionLog wrapper. `SELECT_DREAM_AVATAR` additionally absorbs the package-resolution logic the legacy mutation received pre-computed from the client — find where callers compute `resolvedPackage` today and move that computation in-reducer, replacing any `Math.random` with `ctx.rng`.

- [ ] **Step 1: Failing tests.** Bug classes: **cap clamp** (essence never exits `[0, essenceCap]` across a property sweep of random deltas); **travel modifier decrement** (`TRAVEL_TO_DREAMSCAPE` decrements dreamscapeModifiers and drops zeroed entries — the documented contract on `QuestState.dreamscapeModifiers`); **dream avatar determinism** (same seed + same seq → `SELECT_DREAM_AVATAR` yields byte-identical resolvedPackage via `hashState`); **reset completeness** (`RESET_QUEST` output equals `genesisFoldState` output by hash — catches fields forgotten on reset).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 12: Deck, transfiguration, dreamsign events

**Files:** Create: `src/rules/quest/deck.ts`, `src/rules/quest/deck.test.ts`; Modify: `src/rules/reducer.ts`

Cases: `ADD_CARD`, `REMOVE_DECK_ENTRY`, `PURGE_DECK_CARDS`, `DUPLICATE_DECK_ENTRY`, `SET_DECK_ENTRY_STAT_OVERRIDE`, `SET_DECK_ENTRY_KEYWORDS`, `SET_DECK_ENTRY_TYPE`, `TRANSFIGURE_CARD`, `ACCEPT_TRANSFIGURATION_CHOICE`, `ACCEPT_DUPLICATION_CHOICE`, `PURGE_ALL_BANE_CARDS`, `PURGE_RANDOM_BANE_CARDS`, `ADD_DREAMSIGN`, `REMOVE_DREAMSIGN`, `SET_DREAMSIGN_POOL`, `SET_DREAMSIGN_IS_BANE`. Same relocation method as Task 11.

- [ ] **Step 1: Failing tests.** Bug classes: **entry-id collision** (DUPLICATE produces a deck entry with a fresh unique id — derive ids from `ctx.rng`/seq, never `Math.random`); **stale-target bounce** (REMOVE/TRANSFIGURE targeting an entryId not in the deck bounces rather than silently no-oping inside an "applied" outcome); **random purge determinism** (`PURGE_RANDOM_BANE_CARDS` with same seed+seq removes the same entries); **dreamsign limit** (ADD_DREAMSIGN at `maxDreamsigns` bounces).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 13: Draft events

**Files:** Create: `src/rules/quest/draft.ts`, `src/rules/quest/draft.test.ts`; Modify: `src/rules/reducer.ts`, `src/draft/draft-engine.ts` (or wherever `weightedSample` at `draft-engine.ts:99` lives)

Cases: `PICK_DRAFT_CARD`, `SET_DRAFT_STATE`. Also plug the RNG leak the spec names: `weightedSample` in draft-engine takes an injected `rng: () => number` parameter; all callers thread it (reducer callers pass `ctx.rng`-derived streams; any non-reducer caller passes an explicit rng from its own seed context).

- [ ] **Step 1: Failing tests.** Bug classes: **pick-not-in-pack bounce** (cardId absent from the offered pack → bounce); **double-pick bounce** (second PICK against the same pack position bounces — this is the concurrent-draft-click race made safe); **weightedSample determinism** (same rng stream → same sample; pins the injected-rng contract).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.** Existing draft tests must stay green (they may need the rng parameter threaded — keep their assertions unchanged).

### Task 14: Site events with in-reducer generation

**Files:** Create: `src/rules/quest/sites.ts`, `src/rules/quest/sites.test.ts`; Modify: `src/rules/reducer.ts`

Cases: `OPEN_SITE`, `COMPLETE_DREAM_AUGURY`, `ACCEPT_REWARD`, `ACCEPT_DREAMSIGN_OFFER`, `REJECT_DREAMSIGN_OFFER`, `ACCEPT_ESSENCE`, `REROLL_DREAM_AUGURY`, `FORCE_DREAM_AUGURY_ARCHETYPE`, `COMPLETE_SITE`. `OPEN_SITE` dispatches on the site's type and relocates the generation logic from each legacy `ensure*SiteRuntime` body, drawing from `ctx.rng`. Idempotence rule from the mapping table: existing runtime → unchanged state, outcome **applied**.

- [ ] **Step 1: Failing tests.** Bug classes: **generation nondeterminism** (same seed+seq: two folds of OPEN_SITE yield hash-identical runtime — for every site type, table-driven over the site types the legacy ensure* family handles); **idempotence** (second OPEN_SITE on same site: state hash unchanged, outcome applied); **accept-before-open** (ACCEPT_* on a site with no runtime bounces); **double-accept** (second ACCEPT_* on an accepted site bounces — the coop double-claim race made safe); **reroll advances** (REROLL_DREAM_AUGURY produces a different runtime than the original with overwhelming probability — assert hash differs for a seed where it does, fixture-pinned).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 15: Shop, merchant, modifier events

**Files:** Create: `src/rules/quest/shop.ts`, `src/rules/quest/shop.test.ts`; Modify: `src/rules/reducer.ts`

Cases: `BUY_SHOP_SLOT`, `REROLL_SHOP`, `GRANT_FREE_REROLLS`, `APPLY_SHOP_DISCOUNT`, `ACCEPT_MERCHANT_OFFER`, `DECLINE_MERCHANT`, `PUSH_BATTLE_MODIFIER`, `PUSH_TEMPORARY_BANE_GRANT`, `BAN_SITE_TYPE`, `BOOST_SITE_APPEARANCE`, `REPLACE_SITE_TYPE`, `ADD_SITE_TO_DREAMSCAPE`, `UPDATE_ATLAS`, `SET_CARD_SOURCE_DEBUG`. Also in this task: grep the callers of the legacy `setFailureSummary`; if any caller sets a failure summary outside the battle-defeat path, add `QUEST_FAILED { summary }` (to `events.ts`, this file, and `actions.ts` in Task 25); otherwise `END_BATTLE { result: "defeat" }` fully covers it and no extra event exists.

- [ ] **Step 1: Failing tests.** Bug classes: **insufficient-essence bounce** (BUY with price > essence bounces, essence unchanged); **double-buy bounce** (second BUY on the same slot bounces — the coop race); **discount application** (BUY with `shopModifiers.essenceDiscountPercent` set charges the discounted price — pins the documented ShopModifiers contract); **free-reroll consumption order** (REROLL consumes freeRerolls before charging essence).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 16: Quest-level property tests

**Files:** Create: `src/rules/quest/quest-properties.test.ts`

Cross-cutting suites that only make sense once all quest cases exist:

- [ ] **Step 1: Write the tests.** (a) **Run-field nullability** — the successor to the deleted `NON_NULLABLE_RUN_FIELDS` guard: for 100 random event sequences (seeded generator drawing from the full quest event union with arbitrary payloads) applied after a `START_QUEST`+`SELECT_DREAM_AVATAR` prefix, no reachable state has `draftState`/`resolvedPackage`/`dreamAvatar` transition non-null → null except via `RESET_QUEST`/`LOAD_STATE`. (b) **Total fold safety** — the same 100 sequences never throw and every outcome is applied|bounced. (c) **Determinism** — each sequence folded twice yields identical final hash. (d) **JSON purity** — final states survive `config.encode`/`decode` round-trip with hash equality (catches functions/undefined smuggled into state).
- [ ] **Step 2: Run — expect PASS (these validate Stage B; failures are real bugs in Tasks 10–15, fix them now).**
- [ ] **Step 3: Commit and push.**

---

## Stage C — rules: battle domain

### Task 17: Relocate the pure battle pieces

**Files:**
- Move: `src/battle/state/apply-debug-edit.ts` → `src/rules/battle/apply-debug-edit.ts`; `src/battle/automation/battle-card-effects-table.ts`, `dreamwell-effects-table.ts`, `effect-runner-core.ts`, `rules-text-hash.ts`, `basic-automation.ts` (and `effect-step.ts` + any pure helpers they import) → `src/rules/battle/`
- Move: their existing colocated test files alongside them
- Modify: all importers (grep each old path)

Logic is preserved (spec decision 2). Two mechanical changes only: (1) `collectDawnTriggerEdits` and `planSupportRecompute` take `random: () => number` alongside `nowMs` instead of constructing `StepContext` with `Math.random` internally — signature change, threaded from callers; (2) any `Date.now()` default inside moved code becomes a required parameter. The moved files must satisfy the Task 1 lint rails without logic edits beyond those parameters.

- [ ] **Step 1: Move files, update imports, thread the two parameters.**
- [ ] **Step 2: `npm run lint && npm run typecheck && npm test` — all existing suites for the moved files pass unchanged** (the hash-drift CI gate `battle-card-effects-hash.test.ts` must keep passing from its new location).
- [ ] **Step 3: Commit and push.**

### Task 18: `BattleFoldState` and the effect-queue driver

**Files:** Create: `src/rules/battle/fold.ts`, `src/rules/battle/driver.ts`, `src/rules/battle/driver.test.ts`

`fold.ts`: `BattleFoldState`, `EffectRun`, `PendingPrompt` exactly per spec §Data model (cursor into static tables — no closures in state). `resolveScript(ref: EffectRun["scriptRef"])` maps table+id to the script via `selectBattleCardEffectScript` / `selectDreamwellEffectScript`.

`driver.ts`: `advanceEffectQueue(battle: BattleFoldState, ctx: EventContext): BattleFoldState` — while the queue is non-empty and no prompt is pending: resolve the head run's cursor to its script's remaining steps, call `planNextEffectStep`; on `dispatch` apply the edits via `applyDebugEdit` and advance `stepIndex`; on `prompt` set `pendingPrompt` (promptId = `ctx.seq`, options materialized to plain data from the plan's `active` field) and stop; on `done` pop the run. Also `resolvePendingPrompt(battle, resolution, ctx)` wrapping `applyPromptResolution` and resuming the queue. Randomness: `ctx.rng` with a drawIndex counter threaded through the whole fold step; time: `ctx.timestamp`.

- [ ] **Step 1: Failing tests.** Use real registered scripts (look up UUIDs from `BATTLE_CARD_EFFECTS` — a deterministic materialized script such as Ashwalker's erode, and an interactive script with a prompt step; resolve UUIDs from the table at test-setup time, never hardcode card names as keys). Bug classes: **queue stall** (deterministic script fully applies in one advance — edits visible in board state, queue empty after); **prompt parking** (interactive script stops with `pendingPrompt` set, board unchanged past the pre-prompt steps, queue retains the paused run); **resume correctness** (resolvePendingPrompt applies the resolution edits then continues remaining steps to completion); **cursor serialization** (a state parked on a prompt survives encode/decode round-trip and resumes identically — the closure-smuggling bug class); **multi-run FIFO** (two queued runs execute in queue order).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 19: `BEGIN_BATTLE` and `END_BATTLE`

**Files:** Create: `src/rules/battle/battle-events.ts`, `src/rules/battle/battle-events.test.ts`; Modify: `src/rules/reducer.ts`

`BEGIN_BATTLE { siteId }`: constructs `BattleFoldState` from quest state deterministically. Relocate the init logic from `src/multiplayer/battle-service.ts::ensureBattleSession`'s init construction and its callers in `src/state/use-ensure-battle-session.ts` (deck → battle board, dream avatar, opponent-deck construction), replacing every random draw with `ctx.rng` and every timestamp with `ctx.timestamp`. Bounces if a battle is already in progress. `END_BATTLE { result }`: relocate `incrementCompletionLevel` (victory) and the defeat/failure-summary path from `multiplayer-quest-context.tsx`; clears `state.battle`; bounces if no battle exists.

- [ ] **Step 1: Failing tests.** Bug classes: **init nondeterminism** (same quest state, same seq → hash-identical BattleFoldState twice — the ensureBattleSession race, eliminated); **double-begin bounce** (second BEGIN_BATTLE bounces — the `begunEntryKey` class); **victory bookkeeping** (END_BATTLE victory: completionLevel +1, battleModifiers each decremented and zero-entries dropped, battle null — pins the documented `battleModifiers` contract); **defeat summary** (END_BATTLE defeat: failureSummary populated from the battle state, battle null).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 20: `BATTLE_COMMAND` with fold-time triggers

**Files:** Modify: `src/rules/battle/battle-events.ts`, `src/rules/battle/battle-events.test.ts`, `src/rules/reducer.ts`

The reducer case replacing both effect-runner hooks' orchestration:
1. Apply the command via the relocated `applyDebugEdit` (route force-result commands the way the legacy `battleReducer` in `src/battle/state/reducer.ts` did — absorb that routing here).
2. **Materialized triggers:** compute in-play instance ids before/after this single edit (reuse the relocated helper logic from the deleted hook — reimplement `inPlayInstanceIds` as a pure helper in `battle-events.ts`); for each newly-present id with a registered materialized script, push an `EffectRun` onto the queue.
3. **Dawn bookends:** when the edit advanced the phase into Dawn's completion point (mirror where `basic-automation.ts` calls `collectDawnTriggerEdits` today), apply deterministic dawn edits and queue interactive dawn scripts (one `EffectRun` per interactive script, per the deleted `collectInteractiveDawnRuns` semantics: at most once per (side, turn)).
4. **Dreamwell:** when the edit lands a dreamwell reveal (phase === "dreamwell", turnNumber > 1 — the deleted dreamwell runner's start condition), queue the dreamwell script run selected by `selectDreamwellEffectScript`.
5. **Support recompute:** run `planSupportRecompute` and apply its edits after every command (it is diff-based and idempotent, so unconditional invocation is correct and simpler than shape-tracking).
6. `advanceEffectQueue` until prompt or empty.

- [ ] **Step 1: Failing tests.** Bug classes: **trigger missed** (a command that materializes a scripted card produces the script's edits in the same fold step — single event in, fully-triggered state out); **trigger double-fired** (folding the same log twice, or one client folding what another appended, yields identical state — the double-simulation class, now a determinism assertion); **dawn once-per-turn** (advancing into the same side/turn dawn twice cannot re-queue the interactive run); **support convergence** (after any command, immediately recomputing support yields zero further edits — idempotence at the fold boundary); **prompt blocks queue** (a command materializing an interactive card leaves `pendingPrompt` set and later queued runs unstarted).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 21: `RESOLVE_PROMPT` and `SET_CARD_NOTE`

**Files:** Modify: `src/rules/battle/battle-events.ts`, `src/rules/battle/battle-events.test.ts`, `src/rules/reducer.ts`

`RESOLVE_PROMPT { promptId, resolution }`: matches `state.battle.pendingPrompt.promptId` (else bounce — root rule 4 already gates non-RESOLVE events; this task adds the matching-id apply path, which the root rule-2 fast path routes past the CAS check), applies via `resolvePendingPrompt`, continues the queue. `SET_CARD_NOTE { instanceId, note }`: CAS-exempt; stores the note with `event.clientTimestamp` (relocate whatever note shape `BattleCardNoteEditor.tsx` writes today).

- [ ] **Step 1: Failing tests.** Bug classes: **prompt race** (two RESOLVE_PROMPT events for the same promptId in sequence: first applies, second bounces — both players answering simultaneously); **stale promptId** (RESOLVE_PROMPT with an old promptId after the prompt already resolved bounces); **foresee no-op contract** (a `foresee` resolution applies no edits itself, matching `applyPromptResolution`'s documented behavior — catches regressions in the relocation); **note through prompt** (SET_CARD_NOTE applies while a prompt is open); **resolve through neutral noise** (a matching RESOLVE_PROMPT applies even with an applied partner `SET_CARD_NOTE` or quest-level `OPEN_SITE` in its window — the spec's rule-2 fast path).
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 22: Replay harness and fixtures CI

**Files:** Create: `src/rules/replay/replay.ts`, `src/rules/replay/replay.test.ts`, `src/rules/replay/fixtures/` (initial synthetic fixtures), `scripts/regenerate-replay-fixtures.mjs`

`replay.ts`: `replayLog({ genesis, events }): { finalState, finalHash, outcomes }` — the full `EngineConfig` for the real game (reducer + genesisFoldState + JSON encode/decode + hashState), exported as `GAME_ENGINE_CONFIG` (this config object is also what `src/coop/` consumes in Stage D — single definition).

- [ ] **Step 1: Build 3 synthetic fixtures** via a generator script: (a) a quest-only session (start → dream avatar → travel → open/accept sites → shop buy), (b) a battle session (begin → commands materializing scripted cards → prompt → resolve → end victory), (c) an adversarial session (interleaved two-actor events producing bounces, a prompt race, an OPEN_SITE race). Each fixture stores `{ genesis, events, finalHash }`. `scripts/regenerate-replay-fixtures.mjs` re-runs the generator and re-stamps hashes — the one-command regeneration for intentional reducer changes. Per AGENTS.md, fixtures assert hashes/structure only, never TOML-derived content; the generator resolves card UUIDs from live data at generation time.
- [ ] **Step 2: Failing test → implement → green.** The test replays each fixture and asserts `finalHash` matches. Bug class: any nondeterminism or unintended rules change — this is the permanent regression net for the whole reducer.
- [ ] **Step 3: Commit and push** (fixtures included).

---

## Stage D — the coop React layer

### Task 23: Build hash and version gate primitives

**Files:** Create: `src/coop/build-hash.ts`; Modify: `vite.config.ts`

`vite.config.ts`: add `define: { __BUILD_HASH__: JSON.stringify(<hash>) }` where `<hash>` is the git HEAD hash read at config-load time (`child_process.execSync("git rev-parse --short HEAD")`, with a `"dev"` fallback when git is unavailable). `build-hash.ts`: exports `getBuildHash()` returning `__BUILD_HASH__` with a test-environment fallback (`"test"`), plus the `declare global` for the define.

- [ ] **Step 1: Implement; `npm run typecheck` and `npm test` green (existing suites must not break on the new global).**
- [ ] **Step 2: Commit and push.**

### Task 24: RoomGate, quest-log sink, EventLogViewer

**Files:** Create: `src/coop/RoomGate.tsx`, `src/coop/quest-log-sink.ts`, `src/coop/EventLogViewer.tsx`, `src/coop/VersionGateScreen.tsx`

`RoomGate.tsx` (fresh code; same observable flow as legacy `MultiplayerRoomGate.tsx`): parse `?game=`, auto-create via `createRoomEvictingStale` + navigate, subscribe with a 15s timeout state, write presence, install the quest-log sink with `{ gameId: roomId }` context, and gate: if `genesis.reducerVersion !== getBuildHash()`, render `VersionGateScreen` (read-only message + "start a new game" button that creates a fresh room). `quest-log-sink.ts`: minimal buffered sink appending JSONL strings to `rooms/{id}/logs` with the legacy limits (2000 entries, flush on visibility change) — fresh minimal code, not a port. Single-writer rule per spec §Logging: each client mirrors only the events it appended (its own actor plus its `ai:` actor), tracked past a high-water seq so refolds after reconnect or compaction never re-mirror, as `{ event: "coop_event", seq, type, actor, outcome, stateHashAfter?, gameId }`; its own bounces additionally log `{ event: "event_bounced", seq, interveningSeqs }`; hash mismatches are logged by any observing client as `{ event: "fold_divergence", seq, expected, actual, clientId }`. `EventLogViewer.tsx`: `?viewLogs=<roomId>` renders the decoded event log (seq, type, actor, outcome) plus the raw JSONL sink, with download.

- [ ] **Step 1: Implement.** No new unit tests for the React shells themselves (they are wiring; browser QA in Task 30 covers them) — but the sink's prune/flush logic gets a unit test. Bug class: unbounded log growth (append 2,300 entries → prune keeps newest 2,000).
- [ ] **Step 2: Checks green. Commit and push.**

### Task 25: Hooks and the actions facade

**Files:** Create: `src/coop/hooks.ts`, `src/coop/actions.ts`, `src/coop/actions.test.ts`, `src/coop/BounceToast.tsx`

`hooks.ts`: a `CoopProvider` owning one `createLogClient(GAME_ENGINE_CONFIG, …)` instance per room; `useGameState(): FoldState` (displayed = confirmed + optimistic); `useAppend()`; `useConnectedCount()`; `useEventOutcomes(cb)` for the toast. Bounce UX: when `onEventOutcome` reports a bounce for this client's own event, show `BounceToast` ("Your partner acted first — the board has changed."). `actions.ts`: one named creator per event type in the mapping table, signature-compatible with the legacy `QuestMutations` methods screens call today (verify against the `QuestMutations` interface in `src/state/quest-context.tsx`), each building the payload and calling `append`. Battle: `actions.battleCommand(command)`, `actions.resolvePrompt(promptId, resolution)`, `actions.beginBattle(siteId)`, `actions.endBattle(result)`, `actions.setCardNote(...)`.

- [ ] **Step 1: Failing test for the facade contract.** Bug class: facade/event drift — every action creator produces an event whose `type` exists in the `events.ts` union and whose payload the root reducer routes without bouncing-on-unknown (table-driven: call each creator with minimal valid args against a prepared state, assert outcome ≠ bounced-for-unknown-type). This catches a renamed event type breaking a screen silently.
- [ ] **Step 2–4: Red → implement → green. Step 5: Commit and push.**

### Task 26: Cutover — quest screens

**Files:** Modify: `src/App.tsx`, `src/state/quest-context.tsx`; every `useQuest` consumer that needs signature adjustments (compiler-driven)

Swap the provider tree: `RoomGate` (new) replaces `MultiplayerRoomGate`; `CoopProvider` replaces `MultiplayerQuestProvider`. Rewrite `src/state/quest-context.tsx`'s provider so `QuestContextValue` is backed by `useGameState().quest` and the Task 25 actions facade — the interface shape screens consume stays, its implementation is new. Remove from the interface the mutations that no longer exist (none expected — the facade covers the full table; anything discovered missing here is a facade gap to fix in `actions.ts`).

- [ ] **Step 1: Rewire, then let `npm run typecheck` drive out every consumer error.**
- [ ] **Step 2: `npm run lint && npm run typecheck && npm test` green.** Legacy quest-context tests asserting transaction behavior move to deletion (Stage E); tests asserting interface behavior keep passing.
- [ ] **Step 3: Commit and push** (note in the message: app is mid-cutover until Task 28).

### Task 27: Cutover — battle screens, AI, undo removal

**Files:** Modify: `src/components/BattleSiteRoute.tsx`, `src/components/PlayableBattleScreen.tsx` (and the battle UI components the compiler flags), `src/battle/ai/` integration point (`use-battle-ai` / `ai-may-run-here` call sites); Delete usage of: `MultiplayerBattleProvider`, both effect-runner hooks, undo/redo controls

- `BattleSiteRoute.tsx`: delete `begunEntryKey`; derive the screen from fold state — battle site active + `state.battle === null` → reveal screen whose "Begin" button appends `BEGIN_BATTLE`; `state.battle !== null` → `PlayableBattleScreen`.
- `PlayableBattleScreen.tsx`: board renders from `useGameState().battle.board`; every interaction dispatches `actions.battleCommand(...)`; `state.battle.pendingPrompt` renders the prompt overlays (pick-cards / choice / confirm / foresee) that the effect-runner hooks used to drive, resolving via `actions.resolvePrompt`; remove the undo/redo controls and every `history` import; remove the runner hook mounts and their props (`cancelPromptSignal`, `isPrimaryClient`).
- AI: keep `aiMayRunHere({ connectedCount })`; the AI loop reads fold state and submits `actions.battleCommand` with `actor: "ai:<clientId>"` (the `useAppend` layer accepts an actor override for AI events). Decision logic untouched.

- [ ] **Step 1: Rewire, compiler-driven.**
- [ ] **Step 2: All checks green. Step 3: Commit and push.**

### Task 28: Delete the legacy layer

**Files — Delete (complete inventory):**
- `src/multiplayer/room-service.ts`, `battle-service.ts`, `MultiplayerRoomGate.tsx`, `room-paths.ts`, `battle-paths.ts`, `room-types.ts`, `battle-types.ts`, `action-log.ts`, `rtdb-sanitize.ts`, `battle-normalize.ts`, `log-sink.ts`, `room-log-service.ts`, `RoomLogViewer.tsx`, `room-id.ts`, `firebase-emulator.integration.test.ts`, and every other file under `src/multiplayer/` plus all their test files (the directory ends up empty and removed)
- `src/state/multiplayer-quest-context.tsx`, `src/state/multiplayer-battle-context.tsx`, `src/state/use-ensure-battle-session.ts`, `src/state/quest-state-invariants.ts` + tests
- `src/battle/automation/use-battle-effect-runner.ts`, `use-dreamwell-effect-runner.ts`, `use-battle-effect-runner.test.tsx`, `use-dreamwell-effect-runner.test.tsx`, `battle-effect-runner-helpers.test.ts` (and the helper module it tests if the helpers were not relocated in Task 20)
- `src/battle/state/history.ts` + tests; `src/battle/state/reducer.ts` if Task 20 absorbed its routing (verify no remaining importers)

- [ ] **Step 1: Delete, then fix every dangling import the compiler reports.** Grep for each deleted symbol name (`isPrimaryClient`, `remoteCommandEpoch`, `ownsRunRef`, `cancelPromptSignal`, `commandSerial`, `EMPTY_SHARED_HISTORY`, `writeRoomTransaction`, `NON_NULLABLE_RUN_FIELDS`, `ensureBattleSession`, `begunEntryKey`, `undoBattleHistory`) — zero hits outside docs/ when done.
- [ ] **Step 2: `npm run lint && npm run typecheck && npm test` green.**
- [ ] **Step 3: Commit and push.**

### Task 29: Docs and guardrails

**Files:** Modify: `AGENTS.md`; Check: `docs/quest_prototype/qa_scenes.md`, `docs/quest_prototype/coop_event_sourcing_proposal.md`

- [ ] **Step 1: AGENTS.md** gains the review rule from the spec, stated as current practice (never "no longer" phrasing per the documentation style rule): "Coop game state is a fold of the room event log. React `useState`/`useRef` never gates game flow; anything both players must agree on is an event in the log. Clients write intent events only, via `src/coop/actions.ts`." 
- [ ] **Step 2: Verify `?goto=`, `?loadQuest=`, `?startInBattle=1` QA mechanics still work** through the LOAD_STATE/BEGIN_BATTLE bootstraps (they are wired in Task 26/27; update `docs/quest_prototype/qa_scenes.md` only if the mechanics' user-facing behavior changed).
- [ ] **Step 3: Update the proposal's Status line** to implemented, pointing at the spec.
- [ ] **Step 4: Commit and push.**

### Task 30: End-to-end verification

- [ ] **Step 1: Full checks:** `npm run lint && npm run typecheck && npm test`.
- [ ] **Step 2: Browser QA** per AGENTS.md: start `npm run dev -- --port 5174` (capture the PID; kill only that PID at teardown), drive with `/opt/homebrew/bin/agent-browser`. Scenarios, each checking the error buffer for render errors/unhandled rejections/console errors and visual coherence:
  1. Fresh room → start quest → pick dream avatar → travel → open a site → accept — single-player happy path.
  2. **Two tabs, same room:** both click the same shop slot near-simultaneously → exactly one purchase, the loser sees the bounce toast, boards converge.
  3. Two tabs: enter a battle site, one clicks Begin → both see the battle; **reload one tab mid-battle** → it re-folds to the battle screen (the `begunEntryKey` regression test).
  4. Battle: materialize a scripted interactive card → prompt renders in both tabs → both answer → one resolution applies, boards converge.
  5. `?viewLogs=<roomId>` shows the event log with outcomes.
  6. Confirm no undo/redo controls render anywhere in battle.
- [ ] **Step 3:** Grep `logs/quest-log.jsonl` for the session's `gameId`: `coop_event` entries present with seq/type/actor/outcome; zero `fold_divergence`.
- [ ] **Step 4: Commit any QA fixes and push.** Deploy (`npm run deploy`) only if the user asks.
