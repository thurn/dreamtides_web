# Coop Event-Sourcing Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the findings of `docs/postmortems/2026-07-08-coop-event-sourcing-audit.md` — close the three P0 convergence holes, make every failure path visible and non-terminal, fix the converge-but-wrong game-correctness bugs, and stand up CI so the resilience tests actually run.

**Architecture:** Five sequential tasks sized for one subagent each. Task 1 changes engine semantics (event outcomes become immutable across compaction; fold-relevant config moves into genesis) and must land first — every later task's tests run against the corrected engine. Task 2 hardens the failure paths (containment, append rejection, refold hygiene). Task 3 migrates the draft bootstrap into the reducer. Task 4 fixes game-correctness bugs in the battle/journey reducers. Task 5 adds CI, the missing convergence tests, and the hygiene tail. Tasks 3 and 4 are independent of each other; everything else is ordered.

**Tech Stack:** TypeScript, Vite, Vitest, Firebase RTDB (+ emulator), js-sha256. No new dependencies.

## Global Constraints

- All work happens in one git worktree branched from `master` (per AGENTS.md / the `wt` skill); commit with detailed messages and `git push` after each task.
- Run from repo root after each task: `npm run lint && npm run typecheck && npm test`. In a fresh worktree run `npm install` first, and run `./scripts/regenerate-assets.sh` once after creating it.
- `src/rules/` must stay free of Firebase, React, `Math.random`, `Date.now`, and argless `new Date()` (lint-enforced — do not weaken `eslint.config.js`).
- `src/eventlog/` must not import from `src/rules/` or `src/coop/` (lint-enforced).
- Cards are identified by UUID only; never key or compare by card name.
- No test may assert on TOML-sourced content values (card names, costs, pool contents) — derive fixtures from live data or use the synthetic providers.
- When a task changes reducer behavior or rng draw order, regenerate the replay fixtures with `node scripts/regenerate-replay-fixtures.mjs` and commit the regenerated `src/rules/replay/fixtures/*.json` in the same commit as the change.
- Documentation and code comments describe the current system only — never "no longer", "previously", or "we removed".
- Per the plan author's conventions this plan pins contracts (signatures, invariants, representative assertions) rather than full file bodies; the executor writes the implementation with the typechecker in the loop.

---

### Task 1: Engine convergence — immutable outcomes across compaction, genesis-pinned content config

Fixes audit findings **P0-1** (compaction can flip a live-applied event to bounced in the snapshot) and **P0-2** (provider content parameterized by per-client URL config).

**Files:**
- Modify: `src/eventlog/types.ts` (LogNode/EncodedLogNode/Genesis shapes)
- Modify: `src/eventlog/append.ts` (compaction persists the applied index)
- Modify: `src/eventlog/fold.ts` (intervening windows enumerable below the horizon)
- Modify: `src/eventlog/subscribe.ts` (decode the applied index)
- Modify: `src/eventlog/client.ts` (seed `appliedBySeq` from the node; stop pruning it)
- Modify: `src/eventlog/room.ts` (genesis carries content config)
- Modify: `src/coop/RoomGate.tsx` (stamp + gate on content config)
- Modify: `src/runtime/runtime-config.ts` (export the comparable config slice)
- Test: `src/eventlog/append.test.ts`, `src/eventlog/fold.test.ts`, `src/eventlog/client.test.ts`, `src/eventlog/room.test.ts`, `src/coop/` RoomGate coverage, `src/eventlog/emulator.integration.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact shapes):

```ts
// types.ts — additions
export interface EncodedLogNode {
  // ...existing fields unchanged...
  /** JSON string encoding Record<seq, {actor, type}> for every APPLIED event
   *  with seq <= baseSeq. Written by compaction; absent only pre-compaction. */
  appliedIndex?: string;
}
export interface LogNode {
  // ...existing fields unchanged...
  /** Decoded applied index for seqs <= baseSeq (empty map pre-compaction). */
  appliedIndex: Map<number, { actor: string; type: string }>;
}
export interface Genesis {
  seed: string;
  reducerVersion: string;
  createdAt: number;
  /** Fold-relevant content parameters, pinned at room creation. */
  contentConfig: ContentConfig;
}
export interface ContentConfig {
  poolVariant: string;
  draftMode: string;
  fresh20PackSize: number | null;
  journeyVariant: string;
}
```

- Produces: `contentConfigFromRuntime(config: RuntimeConfig): ContentConfig` in `src/runtime/runtime-config.ts`, and `contentConfigsEqual(a, b): boolean` (field-wise; used by RoomGate and tests).
- The `"unknown"` intervening value remains in `EventContext` (reducers keep bouncing on it), but after this task the engine only produces it when an applied index that should cover the window is missing (defensive; not reachable through normal operation).

**Design (pinned — do not re-decide):** an event's outcome must be a pure function of the log prefix, identical no matter when a client joins or when compaction runs. Today the compaction fold reports `"unknown"` for `basedOnSeq < baseSeq` because the identities of applied events below the horizon are discarded. The fix persists them: compaction stores a compact `appliedIndex` (seq → `{actor, type}`, applied events only, ~40 bytes each — unbounded growth is acceptable at prototype room lifetimes) next to `baseSnapshot`, and every fold (compaction's, a joiner's full refold, the incremental client) seeds `appliedBySeq` from it. With the index present, `computeIntervening` enumerates every window instead of reporting `"unknown"`.

- [ ] **Step 1: Write the failing engine tests.** In `fold.test.ts` and `append.test.ts` (toy reducer), add:

```ts
it("a stale-basedOnSeq self-chain keeps its applied outcome across two compactions", () => {
  // Build a log: actor A appends >2*COMPACT_THRESHOLD events, all basedOnSeq: 0
  // (pure self-chain). Drive applyAppend so compaction runs at least twice.
  // Assert: fold-from-genesis of all events === decode(baseSnapshot) folded with
  // the remaining live events — same final state AND the same per-seq outcomes.
});
it("compaction writes an appliedIndex covering exactly the applied seqs <= baseSeq", ...);
it("a joiner folding from the snapshot computes the same intervening window a live client saw", ...);
```

Also update the `emulator.integration.test.ts` scenario-B/C header comment: the equivalence now holds below the compaction horizon too, and the scenario should assert it (extend scenario B to have one client join fresh *after* compaction and compare hashes with the always-connected client).

- [ ] **Step 2: Run the new tests to verify they fail.** `npx vitest run src/eventlog/fold.test.ts src/eventlog/append.test.ts` — expect the equivalence test to fail with differing outcomes (bounced-in-snapshot vs applied-live).

- [ ] **Step 3: Implement the engine change.**
  - `append.ts` `applyAppend`: decode `encoded.appliedIndex` (default `{}`), pass it as `options.appliedBySeq` to the compaction `foldEvents` call, then merge the batch's newly-applied entries (from `buildAppliedIndex`) and persist as the new `appliedIndex` JSON alongside the new snapshot.
  - `fold.ts` `computeIntervening`: with a seeded index the `basedOnSeq < baseSeq` guard changes meaning — return `"unknown"` only when `basedOnSeq < lowestCoveredSeq` (track the horizon the index covers; when the index is complete from seq 0, that is never). Keep the signature; add a `coveredFromSeq: number` field to `FoldOptions` (0 when a full index is supplied).
  - `subscribe.ts` `decodeLogNode`: decode `appliedIndex` into the `LogNode` map (tolerate absence → empty map).
  - `client.ts`: on full refold, seed `appliedBySeq` from `node.appliedIndex` instead of `appliedBySeq.clear()` alone; delete the pruning loop at the end of `foldConfirmedRange` (entries ≤ baseSeq are now legitimately consulted).

- [ ] **Step 4: Run engine tests to verify they pass.** `npx vitest run src/eventlog/` — all pass. Then `npm test`; if the adversarial replay fixture's hash changed (it contains stale-`basedOnSeq` events whose outcomes may legitimately flip to applied), regenerate fixtures and eyeball the diff: only outcomes that were live-applied may change.

- [ ] **Step 5: Commit.** `git add -A && git commit` — message explains the outcome-immutability invariant and the appliedIndex schema addition. `git push`.

- [ ] **Step 6: Write the failing config-pinning tests.**

```ts
// room.test.ts
it("createRoom writes genesis.contentConfig verbatim", ...);
// RoomGate coverage (pattern-match the existing version-gate test):
it("renders the config gate when genesis.contentConfig differs from the local runtime config", ...);
it("mounts children when contentConfig matches", ...);
```

- [ ] **Step 7: Run to verify failure, then implement.**
  - `runtime-config.ts`: add `contentConfigFromRuntime` + `contentConfigsEqual` (pure, exported).
  - `RoomGate.tsx`: `createFreshGenesis` stamps `contentConfig: contentConfigFromRuntime(runtimeConfig)`; the subscription check that today compares `reducerVersion` also compares `contentConfigsEqual(node.genesis.contentConfig, localConfig)` and on mismatch sets a `configGate` status rendering a screen (reuse the `VersionGateScreen` visual pattern) with a button that rewrites `window.location.search` to the room's pinned params and reloads.
  - Rooms are short-lived (24h eviction) and die on deploy, so no fallback for a genesis without `contentConfig` is needed beyond treating it as a mismatch.

- [ ] **Step 8: Verify, run the full suite, commit.** `npm run lint && npm run typecheck && npm test`, then `PATH=... npm run test:emulator` (see `package.json:21` for the Java path prefix) — all green. Commit and push.

---

### Task 2: Failure paths — containment, append rejection, refold hygiene

Fixes audit findings **P1-1** (blanket reducer catch), **P1-2** (wedged prompt), **P1-3** (stranded pending intent), **P1-4** (refold outcome/toast loss, `onFoldError` spam, rewind state), **P1-5** (compaction throw paths), **P1-6** (corrupt genesis/snapshot freeze), **P1-7** (gap-skip).

**Files:**
- Modify: `src/rules/reducer.ts` (narrow the catch)
- Modify: `src/rules/battle/battle-events.ts` (driver-failure fallback in `battleCommand` and `resolvePrompt` cases)
- Modify: `src/eventlog/client.ts` (append rejection, pending sweep, error dedup, rewind reset, gap stop)
- Modify: `src/eventlog/append.ts` (compaction never throws out of the updater)
- Modify: `src/eventlog/subscribe.ts` (total decode)
- Modify: `src/coop/hooks.ts` (toast wiring for the two new callbacks)
- Modify: `src/coop/RoomGate.tsx` (unreadable-room state)
- Test: `src/rules/reducer.test.ts`, `src/rules/battle/battle-events.test.ts` or `driver.test.ts`, `src/eventlog/client.test.ts`, `src/eventlog/append.test.ts`, `src/eventlog/subscribe.test.ts`

**Interfaces:**
- Consumes: Task 1's `LogNode.appliedIndex` (already merged).
- Produces:

```ts
// client.ts — LogClientCallbacks<S> additions (both optional):
/** io.append rejected; the intent was removed from the pending queue. */
onAppendFailed?: (event: GameEvent, error: unknown) => void;
/** A full refold discarded these unconfirmed intents. */
onPendingDropped?: (events: GameEvent[]) => void;

// subscribe.ts — decodeLogNode becomes genuinely total:
export function decodeLogNode(encoded: EncodedLogNode): LogNode | null; // null = corrupt genesis/snapshot
// subscribeToLog gains an optional onCorrupt callback invoked when decode returns null.
```

**Pinned policies (do not re-decide):**
- `reduceGameEvent` keeps **no** try/catch. The CAS prelude (`isCasExempt` / `isMatchingResolve` / `isInterveningWindowClear` / the prompt gate) is total by inspection — set lookups and typeof checks on already-decoded data. Domain cases keep their bounce-on-invalid guards; a *throw* from a domain case is a programmer error and must reach `fold.ts`'s containment (dev rethrow, prod `FoldError` → `fold_error`). Update the reducer doc comment ("Guaranteed not to throw" becomes "bounces on any invalid event content; programmer errors propagate to the engine's containment").
- Battle driver failure fallback: there is exactly **one sanctioned catch in the rules layer**. In `reduceGameEvent`, when the event is a matching `RESOLVE_PROMPT` (rule 2 passed), wrap only that domain call; on throw return `{ state: { ...state, battle: { ...state.battle!, pendingPrompt: null, effectQueue: [] } }, outcome: "applied" }` — the prompt clears, queued automation drops, the board keeps its last good value. Rationale, documented at the site: a throwing resolve must never leave the prompt open, because rule 4 makes a stuck-open prompt permanent (every retry re-throws, every other event bounces). The result is deterministic — both clients fold the identical fallback. Every **other** domain throw (including a `BATTLE_COMMAND` whose queue drain throws) propagates to `fold.ts` containment: the whole event bounces to the pre-event state — no partial application, and no wedge, because a bounced `BATTLE_COMMAND` opened no prompt — with a `fold_error` report in prod and a rethrow in dev. Do not add pre-validation shims (`canResolvePrompt`-style predicates) to avoid the catch; the catch is the containment.
- Compaction (`applyAppend`): pass `{ devMode: false }` to the compaction `foldEvents` call (committed events are history; containment always). Wrap the whole compaction block (`if (head - baseSeq > COMPACT_THRESHOLD) { ... }`) in try/catch; on any throw (gap, corrupt genesis JSON) skip compaction for this append — the event still commits, live events accumulate, and the next append retries. Never throw out of the updater.
- Pending sweep: in `onNode`, when `needFullFold` is true and `pending.length > 0`, drop the whole queue via `pending.splice(0)` and fire `onPendingDropped(dropped)`. (A full refold means the confirmation window is untrustworthy — entries may have committed into the compacted range or never committed; re-echoing either is wrong.)
- Gap handling: `foldConfirmedRange` replaces `continue` with `break` at a missing seq — nothing past a hole folds, `lastFoldedSeq` stays below it, and a later complete node resumes exactly there.
- Emission hygiene: move the `outcome.error → onFoldError` call inside the `seq > lastEmittedSeq` guard; in the rewind branch (`node.head < lastFoldedSeq`) reset `lastEmittedSeq = node.baseSeq` and `divergenceReported.clear()`.
- `submit`: on `io.append` rejection, remove the entry by nonce, `recomputeDisplayed()`, fire `onAppendFailed(event, error)`, and rethrow.

- [ ] **Step 1: Write the failing containment tests.**

```ts
// reducer.test.ts
it("a throwing domain case propagates in dev fold mode and becomes fold_error in prod fold mode", () => {
  // Poison a domain path via a payload the case dereferences after validation
  // is impossible — instead: register a throwing fixture provider (lifecycle
  // seam) and fold START_JOURNEY through foldEvents twice:
  //   devMode: true  → expect(() => fold).toThrow()
  //   devMode: false → outcome "bounced" + outcomes[0].error defined
});
it("a throw while resolving the open prompt clears the prompt instead of wedging", () => {
  // Arrange a battle state with pendingPrompt whose parked run has a cursor
  // pointing past the script end (construct FoldState directly — it is pure data).
  // Fold RESOLVE_PROMPT with the matching promptId.
  // Assert: outcome "applied", battle.pendingPrompt === null, effectQueue === [].
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/rules/reducer.test.ts` — the first fails because the blanket catch eats the throw; the second fails because the bounce leaves the prompt open.

- [ ] **Step 3: Implement the reducer changes** per the pinned policies (delete the blanket try/catch; add the single `RESOLVE_PROMPT` wrap; run the whole rules suite — any test that asserted "never throws" for genuinely-poison inputs moves to asserting containment at the `foldEvents` layer).

- [ ] **Step 4: Write the failing client/engine tests.**

```ts
// client.test.ts (fake io)
it("removes the pending intent and reports onAppendFailed when append rejects", ...);
it("drops all pending intents with onPendingDropped on a full refold", ...);
it("stops folding at a seq gap and resumes when a complete node arrives", () => {
  // Deliver node {head: 3, events: {1, 3}} → folded through seq 1 only.
  // Deliver node {head: 3, events: {1, 2, 3}} → folded through 3, outcomes for 2 and 3 each emitted once.
});
it("emits onFoldError once per seq across a full refold", ...);
// append.test.ts
it("commits the append and skips compaction when the compaction fold throws", ...);
// subscribe.test.ts
it("returns null for a corrupt genesis string and never throws", ...);
```

- [ ] **Step 5: Run to verify failure, implement, re-run.** Implement per pinned policies; `npx vitest run src/eventlog/` green.

- [ ] **Step 6: Wire the UX.** `hooks.ts`: register the two new callbacks where `onEventOutcome`/`onDivergence` are wired; both route to the existing bounce-toast surface with distinct copy ("Action failed to send — try again" / "Connection recovered — unconfirmed actions were discarded") and to the journey-log sink (`event_append_failed`, `pending_dropped` records with `gameId`, `type`, `nonce`). `RoomGate.tsx`: `onCorrupt` → a terminal "room unreadable — start a new game" status using the `VersionGateScreen` pattern.

- [ ] **Step 7: Full verification and commit.** `npm run lint && npm run typecheck && npm test && npm run test:emulator`. Commit (one commit for the reducer containment, one for the client/engine hygiene is a sensible split) and push.

---

### Task 3: Draft activation through the reducer

Fixes audit finding **P0-3**. Scope note: `PICK_DRAFT_CARD` already advances offers deterministically from `ctx.rng`; the client-side `Math.random` path is only the *site-entry bootstrap* (`enterDraftSiteState` → `SET_DRAFT_STATE`). This task replaces that bootstrap with an intent event and deletes the local-override machinery.

**Files:**
- Modify: `src/rules/events.ts` (new event type)
- Modify: `src/rules/reducer.ts` (route + CAS-exempt set)
- Modify: `src/rules/journey/draft.ts` (new `enterDraftSite` case; provider surface extension)
- Modify: `src/coop/providers/draft-provider.ts` (real provider methods)
- Modify: `src/coop/actions.ts` (new creator)
- Modify: `src/screens/DraftSiteScreen.tsx`, `src/screens/cumulus_adapters/DraftSiteScreenAdapter.tsx` (replace bootstrap effect)
- Modify: `src/data/draft-site-bootstrap.ts` (rng injected; `Math.random` call sites removed from the live path)
- Test: `src/rules/journey/draft.test.ts`, `src/rules/reducer.test.ts`, plus browser QA

**Interfaces:**
- Consumes: `EventContext.rng`, `DraftContentProvider` (existing methods `cardDatabase()`, `offerDepsFor(draftState, deckCardNumbers)`, `draftConfigFor(draftState)` — see `src/rules/journey/draft.ts:48-68`), the existing `enterDraftSite(state, siteId, cardDatabase, draftConfig, offerDeps, random)` engine function that `src/data/draft-site-bootstrap.ts:92` calls today.
- Produces:

```ts
// events.ts
ENTER_DRAFT_SITE: { siteId: string };
// added to CAS_EXEMPT_EVENT_TYPES (same rationale as OPEN_SITE: idempotent,
// concurrent double-entry must converge without a bounce toast) and NOT to
// DECISION_NEUTRAL_EVENT_TYPES (it changes the offer — it must count as intervening).

// actions.ts
enterDraftSite: (siteId: string) => Promise<number>;
```

**Pinned semantics for the `ENTER_DRAFT_SITE` reducer case** (mirror `OPEN_SITE`, `sites.ts:305-351`):
1. Bounce when: payload malformed, no provider registered, `journey.draftState === null`, or the site is not a draft site for this run.
2. **Idempotent no-change applied** when `draftState.activeSiteId === siteId` already (zero rng draws on this path — replay at a later seq must not reroll the offer).
3. Otherwise clone `draftState`, call `enterDraftSite(clone, siteId, provider.cardDatabase(), provider.draftConfigFor(clone) ?? DEFAULT_DRAFT_CONFIG, provider.offerDepsFor(clone, deckCardNumbers), rngStream(ctx))` — the same `rngStream` adapter `PICK_DRAFT_CARD` uses (`draft.ts:106`) — and return the updated journey with outcome applied.
4. `enterDraftSiteState` in `draft-site-bootstrap.ts` gains an rng parameter used for its `enterDraftSite` call; the reducer path supplies `ctx.rng`-backed draws. (The function keeps working for any remaining preview callers, but after this task the screens have none.)

**Pinned UI change:** both `DraftSiteScreen.tsx` and `DraftSiteScreenAdapter.tsx` delete the `localDraftState` / `draftStateRef` / `writtenLocalDraftStateRef` bootstrap machinery (the effect at `DraftSiteScreen.tsx:520-566` and its adapter twin) and instead fire `actions.enterDraftSite(siteId)` once per site visit — from an effect keyed on `siteId` guarded only by "the displayed `draftState.activeSiteId` differs from `siteId`". The instant first paint the local bootstrap existed for is provided by the optimistic echo (the intent folds locally with a predicted-seq rng; a skewed prediction shows a preview offer that reconciles to the confirmed one within a round-trip, per the design spec's echo semantics). `SET_DRAFT_STATE` remains as the debug event `App.tsx:587` (`onForceLegendaryOffer`) uses.

- [ ] **Step 1: Write the failing reducer tests** in `src/rules/journey/draft.test.ts` (register the fixture draft provider the existing suite uses):

```ts
it("ENTER_DRAFT_SITE activates the site and reveals a non-empty offer from ctx.rng", ...);
it("is an applied no-change with zero rng draws when the site is already active", () => {
  // Wrap ctx.rng in a spy; assert not called on the idempotent path.
});
it("two clients entering simultaneously converge: fold [enterA@1, enterB@2] — the
    second is a no-change applied, final offers identical to folding enterA alone", ...);
it("bounces without a provider / with a null draftState / for a non-draft site", ...);
it("counts as intervening: a partner intent based before ENTER_DRAFT_SITE bounces", ...); // reducer.test.ts
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/rules/journey/draft.test.ts`.

- [ ] **Step 3: Implement** the event type, reducer case, provider threading, and action creator per the pinned semantics. Run the draft + reducer suites green, then `npm test` and regenerate replay fixtures if any hash moved (the new event type alone should not move them).

- [ ] **Step 4: Migrate the two screens.** Delete the bootstrap machinery; add the intent effect. `npm run lint && npm run typecheck` — the deleted refs will surface every dangling consumer (e.g. `effectiveDraftState` derivations collapse to the displayed state).

- [ ] **Step 5: Browser QA (required — this is player-facing).** From the worktree: `npm run dev -- --port 5174`, then with `/opt/homebrew/bin/agent-browser --session coop-hardening-draft`: open two tabs on the same room, navigate to a draft site (`docs/journey_prototype/qa_scenes.md` for `?goto=` routes), and verify: (a) the offer paints immediately on entry with no flicker, (b) both tabs show the identical offer after a round-trip, (c) both tabs entering simultaneously produces no bounce toast and one shared offer, (d) picking works and reveals the next offer on both tabs, (e) the captured error buffer is clean. Assert `location.href` + `window.innerWidth` before each screenshot. Tear down only this session and this server (`dev-with-emulator.mjs --port 5174` process tree — see `docs/journey_prototype/qa_tooling.md`).

- [ ] **Step 6: Commit and push** with the QA evidence summarized in the message.

---

### Task 4: Game-correctness fixes in the reducers

Fixes audit findings **P1-8** (gesture atomicity), **P1-9** (hash/encode `undefined` + missing round-trip assertion), **P2-1** (support recompute ordering), **P2-2** (dreamwell reveal side), **P2-3** (double-click delta double-apply), **P2-4** (`LOAD_STATE` validation), **P2-5** (applied no-ops pollute CAS windows), **P2-6** (`pick-cards` candidate validation).

**Files:**
- Modify: `src/rules/events.ts`, `src/rules/reducer.ts` (BATTLE_GESTURE; decision-neutral set)
- Modify: `src/rules/battle/battle-events.ts` (gesture case, reveal side, resolution validation, support ordering)
- Modify: `src/rules/battle/driver.ts` (post-drain support recompute seam if needed)
- Modify: `src/rules/journey/lifecycle.ts` (LOAD_STATE validation)
- Modify: `src/eventlog/hash.ts` (JSON-semantics canonicalization)
- Modify: `src/eventlog/client.ts` (dev-mode JSON-safety assertion)
- Modify: `src/coop/hooks.ts` (`useSingleFlight`)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (submit one gesture)
- Test: respective suites + `src/rules/journey/journey-properties.test.ts`
- Regenerate: `src/rules/replay/fixtures/*.json` (support ordering changes draw order)

**Interfaces:**
- Produces:

```ts
// events.ts
BATTLE_GESTURE: { commands: unknown[] };   // each element a BattleCommand; validated in the case
// DECISION_NEUTRAL_EVENT_TYPES gains "MARK_SITE_VISITED" and "DISMISS_STARTING_DECK_POPUP".

// hooks.ts
/** Wraps an async action; invocations while one is in flight resolve to null and do not re-fire. */
export function useSingleFlight<A extends unknown[]>(fn: (...args: A) => Promise<number>): (...args: A) => Promise<number | null>;

// eventlog — dev-mode safety walker (game-agnostic, exported for tests):
/** Throws (dev) listing the first path holding undefined/function/NaN/±Infinity. */
export function assertJsonSafe(value: unknown, label: string): void;
```

**Pinned semantics:**
- **BATTLE_GESTURE**: the case folds each command through the same per-command pipeline `battleCommand` uses (edit → triggers → dawn → dreamwell → queue), sequentially within the one fold step, threading a single continuing rng draw counter. If any command fails validation (or the battle/prompt gates reject mid-sequence), the whole event bounces — all-or-nothing; no partial gesture can exist in the log. `PlayableBattleScreen.tsx:286-297` submits `actions.battleGesture(plannedCommands)` whenever `plannedCommands.length > 1`, a single `BATTLE_COMMAND` otherwise.
- **hash.ts**: `canonicalize` mirrors `JSON.stringify` semantics exactly — object entries whose value is `undefined`/function/symbol are omitted; such values in arrays emit `null` — so `hash(s) === hash(decode(encode(s)))` for every state by construction. The invariant that made the sentinel necessary (undefined must not hide) moves to `assertJsonSafe`, which `client.ts` runs on the folded state after each applied event when `devMode` (and which Task 4's tests call directly). Update `hash.test.ts` accordingly (NaN/Infinity are caught by the walker, not the hash).
- **Support recompute**: today `battle-events.ts:464` recomputes before the queue drains. Move the recompute to run **after** `advanceEffectQueue` returns (recompute `advanced.board`, preserving `advanced.pendingPrompt`/`effectQueue`), and equivalently after the drain inside the `RESOLVE_PROMPT` path (`resolvePendingPrompt` return). Recompute is idempotent, so running it while a prompt is parked is safe. This changes rng draw order → regenerate replay fixtures.
- **Dreamwell reveal side**: replace the single `revealSide = boardAfter.activeSide` check (`battle-events.ts:441`) with a per-side edge check — for each of the two sides, if `dreamwellDrawnTurn` transitioned to `turnNumber` in this event, queue that side's revealed card script (same phase/turn/result guards).
- **`RESOLVE_PROMPT` candidate validation**: before resolving a `pick-cards` prompt, require every chosen id to be a member of the candidate ids recorded in `pendingPrompt.options` and the count within the prompt's min/max; violation bounces (rule 5), it does not clear the prompt.
- **LOAD_STATE**: add `validateLoadedState(payload, genesis): FoldState | null` — structural checks (required JourneyState fields present with correct primitive types; `seed === genesis.seed`; run-field nullability rules; if a battle slice is present, every `effectQueue`/`pendingPrompt` `scriptRef` resolves via `selectBattleCardEffectScript`/`selectDreamwellEffectScript` and cursors are in range). `null` → bounce. Remove the LOAD_STATE carve-out from the nullability property test where the validator now enforces it.
- **Decision-neutral no-ops**: adding the two types to `DECISION_NEUTRAL_EVENT_TYPES` is the complete fix (they stop invalidating partners' windows); their reducer cases are unchanged.
- **Double-click**: apply `useSingleFlight` to the reward/purchase surfaces that emit delta events (`grep -rn "changeEssence\|grantFreeRerolls\|purgeRandomNightmareCards" src/screens src/cumulus src/components` and wrap the button handlers found); debug-panel deltas are exempt by design (rapid repeat is a feature there).

- [ ] **Step 1: Write failing tests for the reducer-side fixes** (each in its owning suite):

```ts
it("BATTLE_GESTURE applies all commands or none", () => {
  // [validMove, invalidCommand] → bounce, state unchanged;
  // [validMove, validSpend] → applied, both effects present.
});
it("staticSparkBonus is correct after a queued effect returns a supporter to play", ...); // the Celestial Gateway shape from the audit
it("a non-active-side dreamwell reveal queues that side's script exactly once", ...);
it("RESOLVE_PROMPT bounces when a chosen id is outside the prompt candidates", ...);
it("LOAD_STATE bounces on a seed mismatch / a nulled run field / an unresolvable scriptRef", ...);
it("a partner's MARK_SITE_VISITED does not bounce a concurrent ADJUST_ESSENCE", ...); // reducer.test.ts
it("hash equals hash after encode/decode for a state containing an undefined-valued key", ...); // hash.test.ts
it("assertJsonSafe names the path of an undefined value / NaN", ...);
```

- [ ] **Step 2: Run to verify failures, implement per pinned semantics, re-run green.** Suites: `npx vitest run src/rules/ src/eventlog/hash.test.ts`.

- [ ] **Step 3: Regenerate replay fixtures** (`node scripts/regenerate-replay-fixtures.mjs`), run `npm test`, and extend `journey-properties.test.ts` to register the fixture `BattleInitProvider` (from `src/rules/replay/fixture-providers.ts`) so the battle slice participates in the determinism/JSON-purity/hash properties — the audit's coverage gap G2.

- [ ] **Step 4: Client-layer pieces.** `useSingleFlight` + its hook test (two synchronous invocations → one append on the fake); wire it at the delta-emitting surfaces found by the pinned grep; the `assertJsonSafe` call in `client.ts` behind the existing `devMode` resolution. `PlayableBattleScreen` gesture submit. `npm run lint && npm run typecheck && npm test`.

- [ ] **Step 5: Browser QA** (battle surface changed): from the worktree on port 5174 with a fresh `--session coop-hardening-battle`, use `?startInBattle=1` (see the battle QA memory/docs), play a card and hand off a turn in a two-tab room, verify no half-applied gesture under rapid alternating clicks and a clean error buffer. Tear down the session and server.

- [ ] **Step 6: Commit and push** (logical commits: hash+walker, battle fixes, journey fixes, UI wiring).

---

### Task 5: CI, convergence coverage, and the hygiene tail

Fixes audit findings **P1-10** (CI runs zero tests; chaos storm toy-only), **P2-7** (room-create overwrite), **P2-8** (AI presence default), and the P3 items: **P3-2** (client decode bypass), **P3-3** (`Date.parse`), **P3-5** (event-type registries), **P3-6** (rule-2 comment), **P3-8** (merchant entry ids), **P3-9** (bounce `interveningSeqs`), **P3-10** (stale `test:emulator` filter), **P3-11** (debug setter clamps).

**Files:**
- Create: `.github/workflows/checks.yml`
- Modify: `src/eventlog/emulator.integration.test.ts` (real-reducer scenario), `src/eventlog/room.ts`, `src/eventlog/subscribe.ts`/`client.ts` (decode path), `src/eventlog/fold.ts` (+`interveningSeqs` on bounced outcomes), `src/battle/ai/ai-may-run-here.ts`, `src/rules/battle/battle-events.ts` (timestamp parse), `src/rules/events.ts` (registry tie), `src/state/resolveMerchantOffer.ts` (entry ids), `src/rules/journey/lifecycle.ts` (clamps), `src/coop/hooks.ts`/`journey-log-sink.ts` (intervening seqs), `package.json`, `eslint.config.js` (`Date.parse` restriction)
- Test: respective suites

**Interfaces:**
- Produces:

```ts
// fold.ts — FoldOutcome addition:
/** Present on a rule-3 bounce: the applied partner seqs that invalidated it. */
interveningSeqs?: number[];
// client.ts threads it: onEventOutcome gains an optional 4th arg `detail?: { interveningSeqs?: number[] }`
// consumed by hooks.ts → recordBounce (replacing the hardcoded []).

// room.ts
export class RoomExistsError extends Error {}
// createRoom / createRoomEvictingStale reject with RoomExistsError instead of overwriting;
// RoomGate retries with a fresh generateRoomId() up to 3 times.

// rules/battle — replace both Date.parse(ctx.timestamp) call sites:
/** Strict ISO-8601 parse; returns null (never NaN, never locale-dependent) on any other input. */
export function isoTimestampToMs(timestamp: string): number | null;
```

**Pinned CI shape (`.github/workflows/checks.yml`):** one workflow, `on: [push: {branches: [master]}, pull_request]`, two jobs — `checks`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`; `emulator`: `npm ci`, install JDK (`actions/setup-java@v4`, temurin 21) and `firebase-tools` (`npm i -g firebase-tools`), then `firebase emulators:exec --only database --project demo-journey-prototype "npx vitest run --no-file-parallelism src/eventlog/emulator.integration.test.ts"`. Also fix `package.json`'s `test:emulator` to drop the `src/multiplayer/...` filter. Copy the Node-version pin rationale from `firebase-hosting-merge.yml` if a pin exists there.

**Pinned real-reducer convergence scenario** (in `emulator.integration.test.ts`): register the deterministic fixture providers (`registerReplayFixtureProviders` from `src/rules/replay/fixture-providers.ts` — real `GAME_ENGINE_CONFIG`, synthetic content, no TOML dependence per Global Constraints) and run a two-client storm of real journey events (`START_JOURNEY`, `SELECT_DREAM_AVATAR`, `ADJUST_ESSENCE`, `OPEN_SITE`, `ENTER_DRAFT_SITE`, `PICK_DRAFT_CARD`, interleaved invalid/stale intents) asserting: identical final hashes on both clients and on a third client that joins only after compaction has run, dense seqs, zero thrown errors. Clear providers in `afterAll`.

**Pinned small fixes:** AI gate returns `false` while presence is unknown (`ai-may-run-here.ts:40-45`; update its tests); merchant entries mint through `mintEntryId` (`deck.ts:116`) with fixtures regenerated; `setMaxDreamsigns`/`setCompletionLevel` clamp to non-negative integers; the rule-2 doc comment in `reducer.ts` states the real invariant ("no CAS-exempt type alters decision-relevant battle state — notes mutate `cardInstances[id].notes` only"); event-type registries tied with a compile-time check, e.g.:

```ts
const _exhaustive: Record<keyof EventPayloads, true> = KNOWN_EVENT_TYPES_AS_OBJECT; // fails to compile on drift
```

plus a unit test asserting every `KNOWN_EVENT_TYPES` member routes to a non-default `routeDomain` case or is explicitly listed as intentionally unrouted. Client decode path: `LogNode.baseSnapshot` carries the **raw string** (`string | null`); `client.ts` `baseState` calls `config.decode(raw)`; compaction and client now share one decode path (`subscribe.ts` stops pre-parsing it; the `LogNode | null` corrupt-node contract from Task 2 is unchanged). Lint: add `Date.parse` to the `no-restricted-properties` list for `src/rules/**` with a message pointing at `isoTimestampToMs`. Two document-only items from the audit: a comment on `appendEvent`'s null-first-call abort (`append.ts:121-131`) naming the invariant it leans on (the live subscription warms the RTDB cache before `submit` is reachable), and a comment where `EventContext.rng` is defined stating the one-rng-consumer-per-event convention (two consumers at one seq would correlate draws — audit P3-4).

- [ ] **Step 1: Write the failing tests** for the code changes (room existence, AI unknown-presence, `isoTimestampToMs` strictness incl. rejecting `"July 8 2026"`, intervening-seqs threading to `recordBounce`, decode-path symmetry with a non-identity toy `decode`, registry exhaustiveness compile check).
- [ ] **Step 2: Run to verify failures, implement, re-run green.** Regenerate replay fixtures for the merchant entry-id change.
- [ ] **Step 3: Add the CI workflow + emulator scenario.** Verify locally: `npm run test:emulator` green including the new real-reducer scenario.
- [ ] **Step 4: Full verification.** `npm run lint && npm run typecheck && npm test && npm run test:emulator`.
- [ ] **Step 5: Commit and push; confirm the workflow runs green on the pushed branch** (`gh run watch` or `gh run list --branch <branch>`), iterating on the workflow file if the emulator job needs environment fixes.

---

## Execution notes

- **Order:** 1 → 2 → 3 → 4 → 5. Tasks 3 and 4 may run in either order (or in parallel worktrees if using backlog-style execution, though they both touch `src/rules/events.ts` and `reducer.ts` — expect a small merge).
- **Fixture regeneration discipline:** Tasks 1, 4, and 5 may move replay-fixture hashes. Regenerate in the same commit as the behavior change and state in the commit message *why* the hash legitimately moved.
- **Deploy interaction:** Tasks 1 and 3 change the genesis schema and event vocabulary; `reducerVersion` (build hash) already ends in-flight rooms on deploy, so no migration work exists anywhere in this plan.
- **Audit cross-reference:** each task names its audit finding ids; when a task lands, tick the corresponding items in `docs/postmortems/2026-07-08-coop-event-sourcing-audit.md`'s prioritized list (edit the doc in the same commit).
- **Deferred (out of scope):** recording a real-session replay fixture (requires the deployed system to be exercised first — capture via the event log viewer once players have run a session on this build) and a presence heartbeat (audit P2-8 note; current onDisconnect-only behavior matches the design spec).
