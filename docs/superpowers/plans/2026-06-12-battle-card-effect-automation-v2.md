# Battle Card Effect Automation V2 — Full Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend battle card-effect automation from the 4 seed cards to **every** pool card with a ▸Dawn trigger, ▸Materialized trigger, or Support keyword, covering the full effect vocabulary (draw, discard, gain energy, foresee, add spark, gain points, erode, …) — including interactive effects that require player choices.

**Architecture:** First audit the pool into a committed catalog (driven by a script, not by hand). Then build the missing infrastructure: deterministic effect-builders for the full vocabulary, and re-introduce the interactive prompt engine in the battle-effect runner (reusing the already-extracted `effect-runner-core` + the existing dreamwell prompt overlays) so Materialized and Dawn triggers can present foresee / pick-cards prompts. Then register every audited scriptable card in batches by pattern — each automatically covered by the existing hash-drift gate — plus a completeness check that the registry covers the catalog. End with browser QA across the patterns.

**Tech Stack:** TypeScript, React hooks, Vitest, the battle `BattleDebugEdit` reducer, the `logEvent` logging module, Node scripts over `public/cards_v2-data.json`.

---

## Background: current state the implementer must know

The V1 feature (plan `2026-06-12-battle-card-effect-automation.md`) is shipped and on `master`. Key existing pieces:

- **Registry:** `src/battle/automation/battle-card-effects-table.ts` — `BATTLE_CARD_EFFECTS: Record<UUID, BattleCardEffectScript>` where `BattleCardEffectScript = { id; trigger: "dawn"|"materialized"|"support"; textHash; steps?: EffectStep[]; support?: SupportScript }`. Lookups `selectBattleCardEffectScript`, `battleCardAutomationStatus`. Also holds `collectDawnTriggerEdits`, `planSupportRecompute`, `SUPPORT_ADJACENCY`, `collectAutomationHashDrift`. Five cards currently registered (the 4 seeds + Nocturne Strummer).
- **Shared step engine:** `src/battle/automation/effect-step.ts` (`EffectStep`, `EffectPrompt` with kinds `pick-cards | choice | confirm | foresee`, `StepContext = {side,state,random,nowMs}`, pure builders) and `src/battle/automation/effect-runner-core.ts` (`planNextEffectStep`, `applyPromptResolution`, `ActivePrompt`, `PromptResolution`, `EffectStepPlan`). The **dreamwell** runner (`use-dreamwell-effect-runner.ts`) already drives the full prompt queue through these and renders overlays.
- **Battle runner:** `src/battle/automation/use-battle-effect-runner.ts` — currently **deterministic edits only** (no prompt queue). Handles ▸Materialized via in-play-id diff (seed-without-fire, dedupe per `battleCardId`) and Support via `planSupportRecompute`. Wired in `PlayableBattleScreen.tsx` (~line 283) with `{ enabled, state, dispatchEdit: dispatchAutomationEdit }`, returning nothing.
- **Dawn timing:** ▸Dawn folds into `bookendEffectEdits` `case "dawn"` in `src/battle/automation/basic-automation.ts` (deterministic, because automation steps through the transient `dawn` phase synchronously — a React effect can never observe `phase==="dawn"`). `collectDawnTriggerEdits` runs each dawn script's `edits` steps and `console.warn`-skips any `prompt` step.
- **Overlays:** `BattleCardPickerOverlay`, `BattleChoicePromptOverlay`, `BattleForeseeOverlay` — rendered in `PlayableBattleScreen.tsx` (~lines 870–896) bound to `dreamwellRunner.activePrompt`/`resolvePrompt`.
- **Edit kinds** (`src/battle/debug/commands.ts`) for the vocabulary: `DRAW_CARD`, `DISCARD_CARD`, `ADJUST_CURRENT_ENERGY`, `ADJUST_SCORE`, `ERODE`, `SET_CARD_SPARK_DELTA`, plus foresee via the `foresee` prompt (the overlay applies its own deck edits). `staticSparkBonus` + `SET_CARD_STATIC_SPARK_BONUS` exist for Support.
- **Existing builders** (`effect-step.ts`): `drawEdits`, `drawUntilEdits`, `gainEnergyEdits`, `gainScoreEdits`, `alliesInPlay`, `charactersInVoid`, `topOfDeck`, `opponentOf`.
- **Hash gate:** `battle-card-effects-hash.test.ts` recomputes every registered card's `fnv1aHex(renderedText)` from `public/cards_v2-data.json` and fails on drift. This auto-covers any newly registered card.
- **Card identity:** `instance.definition.cardId` is the UUID. **Always key by UUID, never name.**
- **Verification:** `npm run lint && npm run typecheck && npm test` from repo root before each commit; commit + `git push` per task (work on `master`, no branches). The known 1-test skip is expected.

---

## File structure

- **New** `scripts/audit-automation-candidates.mjs` — enumerates + classifies Dawn/Materialized/Support cards, writes the catalog.
- **New** `docs/automation-audit.json` — committed catalog (the audit deliverable; consumed by registration tasks + the coverage test).
- **Modify** `src/battle/automation/effect-step.ts` — add deterministic builders for the full vocabulary.
- **Modify** `src/battle/automation/use-battle-effect-runner.ts` — re-introduce the prompt queue for Materialized + interactive Dawn; expose `{activePrompt, activePromptSide, resolvePrompt}`.
- **Modify** `src/battle/automation/battle-card-effects-table.ts` — interactive-dawn predicate + bookend exclusion; register all audited cards.
- **Modify** `src/battle/components/PlayableBattleScreen.tsx` — render the battle runner's prompts via the existing overlays.
- **New** test files alongside; **modify** the hash/structural test files only as needed.

---

### Task 1: Audit the pool into a committed catalog

This is the audit step. A script does the enumeration + first-pass classification deterministically; the implementer then annotates entries the script marks `needs-judgment`. **Do not skip cards by hand-picking — the script must consider every card.**

**Files:**
- Create: `scripts/audit-automation-candidates.mjs`
- Create: `docs/automation-audit.json` (script output, committed)
- Test: `scripts/audit-automation-candidates.test.mjs` (or a vitest under `src/battle/automation/` that imports the JSON)

- [ ] **Step 1: Write the audit script.** It loads `public/cards_v2-data.json`, and for every card whose `renderedText` contains a ▸Dawn line (`▸Dawn:`), a ▸Materialized line (`▸Materialized:`), or a Support clause (`Support –` / `Support -`), emits a catalog entry. Catalog schema (write each entry in this exact shape):

```jsonc
{
  "generatedFrom": "public/cards_v2-data.json",
  "cards": [
    {
      "id": "<uuid>",
      "name": "<name>",
      "triggers": ["dawn" | "materialized" | "support", ...],   // which apply
      "ruleLines": { "dawn"?: "<line>", "materialized"?: "<line>", "support"?: "<line>" },
      "effects": [                                                // parsed effect atoms
        { "kind": "gain-energy"|"draw"|"discard"|"erode"|"foresee"|"add-spark"|"gain-points"|"support-spark"|"other",
          "amount"?: <number>, "subtypeFilter"?: "<subtype>", "interactive"?: <bool>, "target"?: "self"|"choose"|"all-supported" }
      ],
      "classification": "deterministic" | "interactive" | "partial" | "manual",
      "scriptable": <bool>,
      "notes"?: "<why partial/manual, or what's left to a human>"
    }
  ]
}
```

  Classification rules the script applies (document them in a header comment):
  - **deterministic** — every effect atom maps to a deterministic builder (gain-energy/points, draw N, erode N, add-spark to self, discard-your-hand, support-spark). `scriptable: true`.
  - **interactive** — at least one atom needs a player choice (foresee, "discard a card"/"a card you choose", pick a target). `scriptable: true`.
  - **partial** — part is scriptable, part is not; automate the deterministic portion and name the manual remainder. `scriptable: true`, `notes` names the manual remainder.
  - **manual** — nothing reliably scriptable (conditional/targeted effects the builders can't express). `scriptable: false`, `notes` says why.
  - Anything whose rule line does not match a known phrase pattern → `classification: "manual"`, `scriptable: false`, `notes: "unrecognized phrasing — needs human review"`. **Err toward `manual`**; a missed card is safe (no gear, no automation), a mis-scripted card is not.

- [ ] **Step 2: Run the script**, writing `docs/automation-audit.json`. Then **the implementer reviews every entry the script marked `manual`/`needs human review`** and, where the effect is in fact expressible with the Task-2 builder vocabulary, reclassifies it (editing the script's pattern rules so the catalog regenerates deterministically — do NOT hand-edit the JSON, or it will diverge from the script). Re-run until the JSON is reproducible from the script.

- [ ] **Step 3: Write a catalog smoke test.** Bug class: a malformed catalog silently breaks every downstream registration/coverage step. Assert: the JSON parses; every entry has a valid UUID `id` that exists in `cards_v2-data.json`, a non-empty `triggers` array with only allowed values, a `classification` in the allowed set, and `scriptable` consistent with classification (`manual` ⇒ false, others ⇒ true). Do NOT assert specific card counts or names (that would break as the pool changes).

- [ ] **Step 4: Run lint + the smoke test**, then **commit** `chore(battle): audit Dawn/Materialized/Support automation candidates` and `git push`. Report the per-classification counts in the commit body so reviewers see the scope.

---

### Task 2: Deterministic effect-builder vocabulary

Extend `effect-step.ts` with the deterministic builders the audit needs. Builders stay pure (return `BattleDebugEdit[]`, read state via args).

**Files:**
- Modify: `src/battle/automation/effect-step.ts`
- Test: `src/battle/automation/effect-step.test.ts` (extend if present; else create)

- [ ] **Step 1: Write failing tests** for these builders, each by the bug class noted:
  - `erodeEdits(side, count)` → one `{ kind: "ERODE", side, count }`. (Trivial wrapper for readability/consistency; bug class: wrong edit shape. If you judge a one-element wrapper not worth it, you may skip `erodeEdits` and have scripts inline the edit — note the choice.)
  - `addGainedSparkEdits(battleCardId, amount, state)` → reads the instance's current `sparkDelta` and returns `{ kind: "SET_CARD_SPARK_DELTA", battleCardId, value: current + amount }`. **Bug class: overwriting instead of accumulating** (must add to existing `sparkDelta`, not set to `amount`), and missing-instance handling (return `[]` if the instance is absent).
  - `discardHandEdits(side, state)` → one `{ kind: "DISCARD_CARD", side, battleCardId }` per card currently in `state.sides[side].hand`. **Bug class: off-by-one / wrong zone / wrong order** — emits exactly one discard per hand card.
  - (Energy `gainEnergyEdits`, points `gainScoreEdits`, draw `drawEdits` already exist — no new builder; the audit's deterministic atoms reuse them.)

- [ ] **Step 2–4:** Run tests (fail), implement the builders, run (pass). Keep bodies obvious from the signatures above.

- [ ] **Step 5: Commit** `feat(battle): add deterministic effect builders for erode, gained spark, and hand discard` and `git push`.

> Note: **foresee and player-choice discard are NOT deterministic builders** — they are `prompt` steps (`{ kind: "foresee", count }` and `{ kind: "pick-cards", … }` from `EffectPrompt`). They are handled by the runner prompt queue (Task 3), not here.

---

### Task 3: Re-introduce the interactive prompt queue in the battle runner

Materialized (and, via Task 4, Dawn) scripts may contain `prompt` steps. Refactor `use-battle-effect-runner.ts` so a triggered script runs through the shared queue engine, pausing on prompts and surfacing them to the existing overlays — mirroring `use-dreamwell-effect-runner.ts`. Support recompute stays a separate deterministic effect (unchanged).

**Files:**
- Modify: `src/battle/automation/use-battle-effect-runner.ts`
- Modify: `src/battle/components/PlayableBattleScreen.tsx`
- Test: `src/battle/automation/use-battle-effect-runner.*` helper tests (extend)

- [ ] **Step 1: Change the runner to drive a step queue for Materialized.** Replace the current "dispatch all edits for a newly-materialized instance immediately" path with: when a newly-appeared in-play instance has a `materialized` script, enqueue that script's steps into a run (one run at a time; serialize concurrent materializations with a key guard exactly like the dreamwell `lastRunKeyRef`/`run` pattern). Walk the queue with `planNextEffectStep`/`applyPromptResolution` from `effect-runner-core`: `edits` steps dispatch immediately; a `prompt` step pauses and sets `activePrompt`. Preserve the existing **seed-without-fire on first observation** and **dedupe per `battleCardId`** semantics (a script fires once per materialization). Keep the one-log-entry-per-resolved-effect logging.

- [ ] **Step 2: Expose the prompt interface.** The hook returns `{ activePrompt: ActivePrompt | null; activePromptSide: BattleSide | null; resolvePrompt: (r: PromptResolution) => void }` (same shape as `DreamwellRunnerResult`). Reuse the `ActivePrompt`/`PromptResolution` types from `effect-runner-core`.

- [ ] **Step 3: Render the battle runner's prompts** in `PlayableBattleScreen.tsx`. Capture the hook's return (`const battleRunner = useBattleEffectRunner({...})`) and render its `activePrompt` through the SAME three overlays the dreamwell runner uses (`BattleCardPickerOverlay`, `BattleChoicePromptOverlay`, `BattleForeseeOverlay`), bound to `battleRunner.resolvePrompt`. **Only one runner's overlay may be open at a time** — when the dreamwell runner has an active prompt, suppress the battle runner's overlay (and vice-versa). Dreamwell prompts win ties (dreamwell resolves during its own phase; materialized prompts arise at day/later). Implement the precedence explicitly.

- [ ] **Step 4: Tests** (pure-helper level — hook/React integration is covered by QA):
  - A materialized script containing a `foresee` step: walking it via `planNextEffectStep` yields a `foresee` `ActivePrompt`; the runner does not dispatch past it until resolved. **Bug class: a prompt step from a materialized trigger silently dropped or the queue advancing past an unresolved prompt.**
  - A materialized script `[edits, prompt(pick-cards), edits]`: after `applyPromptResolution` with a chosen id, the resolved edits + remaining queue are correct. **Bug class: post-prompt steps lost.**
  - (Overlay precedence and double-firing are validated in QA.)

- [ ] **Step 5:** `npm run lint && npm run typecheck && npm test`. **Commit** `feat(battle): drive Materialized triggers through the shared prompt queue and overlays` and `git push`.

---

### Task 4: Interactive Dawn triggers

A ▸Dawn script with a prompt cannot run in the synchronous bookend (it can't pause). Route interactive Dawn scripts through the runner, fired once when the active side reaches its first post-dawn rested phase that turn; keep deterministic Dawn scripts in the bookend.

**Files:**
- Modify: `src/battle/automation/battle-card-effects-table.ts` (predicate + bookend exclusion)
- Modify: `src/battle/automation/use-battle-effect-runner.ts` (post-dawn firing)
- Test: extend the dawn-trigger + runner-helper tests

- [ ] **Step 1: Add the interactive predicate and exclude such scripts from the bookend.**

```ts
/** A Dawn script is interactive if any of its steps needs a player choice.
 *  Interactive Dawn scripts run through the runner post-dawn, NOT the bookend. */
export function dawnScriptIsInteractive(script: BattleCardEffectScript): boolean {
  return (script.steps ?? []).some((s) => s.kind === "prompt");
}
```

  Change `collectDawnTriggerEdits` so a dawn script for which `dawnScriptIsInteractive` is true is **skipped entirely** (not partially applied). **Bug class: a mixed deterministic+interactive Dawn script being half-applied in the bookend AND again in the runner (double-apply).** Test: `collectDawnTriggerEdits` returns nothing for an interactive dawn card, and still returns the edits for a deterministic dawn card.

- [ ] **Step 2: Fire interactive Dawn through the runner.** Add a post-dawn detection effect to `use-battle-effect-runner.ts`: maintain a `processedInteractiveDawnRef: Set<string>` keyed `${activeSide}:${turnNumber}`. On render, when `enabled`, `turnNumber > 1`, the key is unprocessed, and the phase indicates dawn has already passed this turn:

```ts
const POST_DAWN_PHASES = new Set(["day", "dusk", "night", "challenge"]);
```

  collect the active side's in-play characters whose dawn script `dawnScriptIsInteractive`, enqueue those scripts into the same run queue used for Materialized, and mark the key processed (mark it even when there are none, so it is not rescanned every render). **Bug classes: fires during dreamwell/draw/dawn (too early), fires more than once per (side, turn), fires on turn 1, or fires for the wrong side.** Tests cover the detection helper: returns the scripts exactly once for `(side, turn)` when phase ∈ POST_DAWN_PHASES and turn > 1; nothing when phase is dreamwell/draw/dawn; nothing on a second call with the same key.

- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test`. **Commit** `feat(battle): run interactive Dawn triggers through the runner post-dawn` and `git push`.

---

### Tasks 5–8: Register all audited scriptable cards, by pattern

Each task adds `BATTLE_CARD_EFFECTS` entries for one slice of the catalog. For every card: read its **exact current `renderedText`** from `public/cards_v2-data.json`, write the script (steps/support) using the Task-2 builders and Task-3/4 prompt steps, and set `textHash: fnv1aHex(<that exact text>)` (compute with the project's FNV-1a — e.g. a small node script importing `rules-text-hash`). The existing hash-drift test + structural-invariant test cover every new entry automatically — **do not add per-card tests** (anti-pattern). For **partial** cards, automate the scriptable portion and name the manual remainder in the entry's comment. For **manual** (`scriptable: false`) cards, register nothing.

Split so each task is reviewable and the registry stays navigable. Within each task, work straight down the catalog's matching entries — **register every scriptable one; do not sample.**

- [ ] **Task 5 — Support cards.** All `triggers` ⊇ `["support"]`, scriptable. Static-spark grants: `support: { bonus: () => N, applies?: <subtype filter> }`. Handle conditional support (e.g. "+1✦ for each ⧗") only if the bonus is expressible as a pure function of `ctx.state`; otherwise the audit marked it `manual` and it is skipped. Commit `feat(battle): automate Support spark across the pool` + push.

- [ ] **Task 6 — Deterministic Dawn cards.** `triggers` ⊇ `["dawn"]`, classification `deterministic`/`partial`. `trigger: "dawn"`, `steps` built from `gainEnergyEdits`/`gainScoreEdits`/`drawEdits`/`erodeEdits`/`addGainedSparkEdits`/`discardHandEdits`. Commit `feat(battle): automate deterministic Dawn triggers across the pool` + push.

- [ ] **Task 7 — Deterministic Materialized cards.** `triggers` ⊇ `["materialized"]`, deterministic/partial. `trigger: "materialized"`, deterministic `steps`. Commit `feat(battle): automate deterministic Materialized triggers across the pool` + push.

- [ ] **Task 8 — Interactive cards (Dawn + Materialized).** classification `interactive`. Scripts include `prompt` steps: `{ kind: "foresee", count: N }` for foresee, `{ kind: "pick-cards", label, count, optional, candidates, resolve }` for player-choice discard/target (model `candidates`/`resolve` on the existing dreamwell interactive entries). These exercise the Task-3 queue (and Task-4 path for Dawn). Commit `feat(battle): automate interactive (foresee / choice) Dawn and Materialized triggers` + push.

> If the audit puts very few cards in a slice, you may merge adjacent tasks — note the merge. If a slice is large, the split point is fine to subdivide further; keep each commit reviewable.

---

### Task 9: Registry-covers-catalog completeness check

Catch the "registered some, forgot a batch" failure mode by cross-checking two independently-maintained artifacts.

**Files:**
- Test: `src/battle/automation/battle-card-effects-coverage.test.ts`

- [ ] **Step 1: Write the coverage test.** Load the committed `docs/automation-audit.json`. Assert: **every catalog entry with `scriptable: true` has a key in `BATTLE_CARD_EFFECTS`**, and (optionally) every `scriptable: false` entry is absent. Put the offending UUIDs in the failure message. **Bug class: an audited, scriptable card never got registered.** This reads the committed snapshot, not a live re-derivation from TOML, so routine TOML/pool changes do not trip it (consistent with the AGENTS.md rule) — it only changes when the audit is deliberately re-run.

- [ ] **Step 2:** Run it (it should pass after Tasks 5–8). If it fails, a scriptable card was missed — register it, don't weaken the test. **Commit** `test(battle): assert the automation registry covers every scriptable audited card` and `git push`.

---

### Task 10: Browser QA across patterns

Validate the integrated feature for one representative card of each pattern, per AGENTS.md QA rules. **Start the QA Vite server on a non-default port (5174), capture its PID, and tear down ONLY that process** (`pkill -f "vite --port 5174"` or by PID) — never a broad `pkill -f vite`.

- [ ] **Step 1:** `node scripts/setup-assets.mjs`; launch QA server on 5174; reach a playable battle with basic automation ON (per the battle browser-QA setup). Use the in-battle debug tooling (`CREATE_CARD_FROM_DEFINITION` / inspector) to place specific cards.
- [ ] **Step 2: Gear coverage.** Pick several newly-registered cards across patterns; confirm each shows the gear (`[aria-label="automated"]`) in hand and battlefield only while automation is on. No clipping/overlap at the tested viewport(s).
- [ ] **Step 3: Deterministic effects.** Exercise at least: a Dawn resource gain (energy/points/spark), a Materialized deterministic effect (erode/draw), and a Support spark grant — confirm the board state changes correctly and once.
- [ ] **Step 4: Interactive effects.** Trigger a **Materialized foresee** (or pick-cards) card — confirm the overlay appears, resolves, and applies; and that it does NOT collide with a dreamwell prompt. If the catalog contains an **interactive Dawn** card, advance a turn into day and confirm the prompt fires once post-dawn.
- [ ] **Step 5:** Inspect the console/error buffer for render errors, unhandled rejections, hash-drift warnings, and `skipping non-edits step` warnings (there should be none for registered cards). Tear down only the port-5174 server. Record findings + screenshots.

---

## Self-review notes

- **Spec coverage:** full vocabulary (draw/discard/gain-energy/foresee/add-spark/gain-points/erode) → Task 2 builders + Task 3/4 prompt steps; all Dawn/Materialized/Support cards → Task 1 audit + Tasks 5–8 registration + Task 9 coverage gate; interactive effects (foresee, choices) → Tasks 3–4, 8; hash safeguard → reused, auto-covers new entries; gear → already pool-wide via `battleCardAutomationStatus`, validated in Task 10. The original spec's "reuse the shared engine + prompt overlays" intent is finally realized in Task 3.
- **No-audit-now:** the audit is Task 1, performed at execution time by the script + reviewer, not pre-baked into this plan.
- **AGENTS.md test rule:** the hash-drift gate and the coverage test are both scoped to opted-in/committed artifacts (registered UUIDs; committed catalog snapshot), so neither fails on routine TOML design-data changes.
- **Type consistency:** `dawnScriptIsInteractive`, `POST_DAWN_PHASES`, `erodeEdits`/`addGainedSparkEdits`/`discardHandEdits`, `ActivePrompt`/`PromptResolution` (reused), `BattleCardEffectScript`/`SupportScript` (existing) used consistently.
- **Risk notes:** Task 3 (runner prompt queue) and Task 4 (interactive Dawn timing) are the load-bearing infrastructure; their pure-helper tests pin the queue/precedence/once-per-turn invariants, and Task 10 validates the integration. Partial/manual classification keeps un-scriptable effects out of the registry (no false gear).
