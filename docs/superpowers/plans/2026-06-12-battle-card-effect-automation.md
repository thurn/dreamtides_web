# Battle Card Effect Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When basic automation is on, automatically resolve a hand-curated set of ▸Dawn and ▸Materialized card effects and continuously apply Support static spark in playable battle mode, marked by a gear icon and guarded by a stored rules-text hash.

**Architecture:** Extract the dreamwell runner's *execution* core (step queue + prompt overlays + effect helpers) into shared modules, then add a separate `useBattleEffectRunner` that supplies its own *timing* (Dawn-phase entry, materialization diffing) and a continuous Support recompute pass. Effects are hand-authored scripts keyed by card UUID, exactly like `DREAMWELL_EFFECTS`. A stored FNV-1a hash of each registered card's `renderedText` fails a test (and warns at runtime) when the card text drifts.

**Tech Stack:** TypeScript, React (hooks), Vitest, the battle `BattleDebugEdit` reducer, the `logEvent` logging module.

---

## Background: key facts the implementer needs

- **Dreamwell automation lives in `src/battle/automation/`.** `dreamwell-effects.ts` defines `StepContext`, `DreamwellPrompt`, `DreamwellEffectStep` and pure helpers (`drawEdits`, `gainEnergyEdits`, `gainScoreEdits`, `alliesInPlay`, etc.). `dreamwell-runner-core.ts` defines `planNextDreamwellStep`, `applyPromptResolution`, `DreamwellActivePrompt`, `DreamwellPromptResolution`, `DreamwellStepPlan`. `use-dreamwell-effect-runner.ts` is the React timing hook. `dreamwell-effects-table.ts` holds `DREAMWELL_EFFECTS`, `selectDreamwellEffectScript`, `dreamwellAutomationStatus`.
- **Edits are dispatched** via `dispatchAutomationEdit` (`PlayableBattleScreen.tsx:266`), which wraps the edit in an `APPLY_COMMAND` with `sourceSurface: "auto-system"`. The reducer applies edits in `src/battle/state/apply-debug-edit.ts` (switch on `edit.kind`); edit kinds are typed in `src/battle/debug/commands.ts`.
- **Effective spark** is computed in `src/battle/state/figments.ts` → `selectEffectiveSparkForInstance` (currently `printedSpark + sparkDelta`, clamped ≥ 0; figment stacks sum members + `sparkDelta`).
- **State equality** is `areBattleMutableStatesEqual` in `src/battle/state/history.ts`; per-instance fields are compared around lines 187–202. **Any new `BattleCardInstance` field that affects edits MUST be added here**, or edits that only change it are dropped as no-ops (known gotcha).
- **Support board geometry** (`docs/battle_rules/battle_rules.md:163–167`): `B0→[F0]`, `B1→[F0,F1]`, `B2→[F1,F2]`, `B3→[F2,F3]`, `B4→[F3]`. A back-rank Supporter benefits the up-to-two front-rank occupants of the slots it supports.
- **Card UUID is NOT on `BattleDeckCardDefinition` today** — only `cardNumber` and `name`. Task 1 adds it. The registry is keyed by UUID per the project rule "always identify cards by UUID, never by name."
- **Logging:** `logEvent(event, fields)` and `createBattleLogBaseFields(state, { sourceSurface, selectedCardId })` from `src/logging.ts`. Follow the dreamwell pattern in `use-dreamwell-effect-runner.ts:41–59` (a `BATTLE_EFFECT_LOG` constant map + a `logBattleEffect` wrapper).
- **Verification after each task:** `npm run lint && npm run typecheck && npm test`. Commit after each task. Per `AGENTS.md`, push immediately after committing.

## File structure

- **New** `src/battle/automation/effect-step.ts` — shared step/prompt types + pure helpers (moved from `dreamwell-effects.ts`).
- **New** `src/battle/automation/effect-runner-core.ts` — shared `planNextEffectStep`/`applyPromptResolution` + active-prompt/resolution types (moved from `dreamwell-runner-core.ts`).
- **New** `src/battle/automation/rules-text-hash.ts` — FNV-1a hash + drift verifier.
- **New** `src/battle/automation/battle-card-effects-table.ts` — `BATTLE_CARD_EFFECTS`, `battleCardAutomationStatus`, `selectBattleCardEffectScript`, support geometry constant, Support recompute pure function.
- **New** `src/battle/automation/use-battle-effect-runner.ts` — the timing hook (Dawn + Materialized + Support recompute).
- **New** test files alongside each.
- **Modify** `src/battle/types.ts` (definition `cardId`, instance `staticSparkBonus`), `card-definition.ts`, `figments.ts`, `history.ts`, `debug/commands.ts`, `apply-debug-edit.ts`, `components/BattleCardView.tsx`, `battle.css`, `components/PlayableBattleScreen.tsx`, and the dreamwell modules' imports.

---

### Task 1: Add card UUID to `BattleDeckCardDefinition`

Without a UUID on the definition, no in-play instance can be matched against the UUID-keyed automation registry.

**Files:**
- Modify: `src/battle/types.ts` (`BattleDeckCardDefinition`, ~line 128)
- Modify: `src/battle/card-definition.ts`
- Modify: every other definition-construction site flagged by the compiler — `src/battle/integration/create-battle-init.ts`, `src/battle/state/apply-debug-edit.ts:1083`, `src/battle/state/create-initial-state.ts`, and any test helpers.
- Test: `src/battle/card-definition.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Assert that `createBaseBattleDeckCardDefinition(card).cardId === card.id` for a sample `CardData`. Bug caught: the base builder dropping the UUID, which would make every automation lookup silently miss.

- [ ] **Step 2: Run it, expect FAIL** (`cardId` not on type / undefined).

Run: `npx vitest run src/battle/card-definition.test.ts`

- [ ] **Step 3: Add the field and populate it**

In `BattleDeckCardDefinition` add (after `sourceDeckEntryId`):

```ts
  /** Stable cards_v2 UUID of the source card. "" for synthetic definitions
   *  (figments, generated copies) that have no catalog card. */
  cardId: string;
```

In `createBaseBattleDeckCardDefinition`, add `cardId: card.id,`.

- [ ] **Step 4: Fix every other construction site.** The compiler will flag each object literal missing `cardId`. For definitions derived from a source `CardData`/card, thread its UUID. For synthetic figment/generated-copy definitions with no source card, set `cardId: ""` (these are never registered for automation). Do NOT add `cardId` to the `areBattleMutableStatesEqual` definition comparison — it is immutable per instance and adds no value there.

- [ ] **Step 5: Run typecheck + the test, expect PASS.**

Run: `npm run typecheck && npx vitest run src/battle/card-definition.test.ts`

- [ ] **Step 6: Commit** (`feat(battle): carry card UUID on BattleDeckCardDefinition for automation lookup`), then `git push`.

---

### Task 2: Extract shared effect-step types and helpers

Rename the generic step machinery out of the dreamwell-specific module so both runners share one source. This is a behavior-preserving refactor; the existing dreamwell tests are the guard.

**Files:**
- Create: `src/battle/automation/effect-step.ts`
- Modify: `src/battle/automation/dreamwell-effects.ts` (becomes dreamwell-only: keep `DreamwellEffectScript`, re-export nothing it no longer owns), `dreamwell-effects-table.ts`, `dreamwell-runner-core.ts`, `use-dreamwell-effect-runner.ts`, and any test imports.

- [ ] **Step 1: Move the shared symbols.** Move `StepContext`, the prompt union (renamed `DreamwellPrompt` → `EffectPrompt`), the step union (`DreamwellEffectStep` → `EffectStep`), and all pure helpers (`opponentOf`, `charactersInVoid`, `eventsInVoid`, `enemyCharactersInPlay`, `alliesInPlay`, `drawUntilEdits`, `drawEdits`, `gainEnergyEdits`, `gainScoreEdits`, `topOfDeck`) into `effect-step.ts`. Keep their bodies identical.

- [ ] **Step 2: Update `DreamwellEffectScript`** (in `dreamwell-effects.ts` or moved into the table file) to use `EffectStep`. Update all dreamwell importers to import the renamed symbols from `effect-step.ts`. The confirm prompt's `onYes: EffectStep[]` and the choice/pick-cards builder signatures are unchanged apart from the type rename.

- [ ] **Step 3: Run the full suite, expect PASS.** No new test — the existing dreamwell runner/core tests pin behavior.

Run: `npm run typecheck && npm test`
Expected: green, no behavior change.

- [ ] **Step 4: Commit** (`refactor(battle): extract shared effect-step types and helpers from dreamwell`), then `git push`.

---

### Task 3: Extract shared runner core

**Files:**
- Create: `src/battle/automation/effect-runner-core.ts`
- Modify: `src/battle/automation/dreamwell-runner-core.ts` (delete after move or keep as thin re-export — prefer delete and update importers), `use-dreamwell-effect-runner.ts`, tests.

- [ ] **Step 1: Move `planNextDreamwellStep` → `planNextEffectStep`, `applyPromptResolution` (keep name), and the types `DreamwellActivePrompt` → `ActivePrompt`, `DreamwellPromptResolution` → `PromptResolution`, `DreamwellStepPlan` → `EffectStepPlan`** into `effect-runner-core.ts`, importing `EffectPrompt`/`EffectStep`/`StepContext` from `effect-step.ts`. Bodies unchanged (the confirm→Yes/Skip mapping and defensive fallbacks stay exactly as in `dreamwell-runner-core.ts:38–129`).

- [ ] **Step 2: Re-point `use-dreamwell-effect-runner.ts`** and any test files to the new module/names.

- [ ] **Step 3: Run the suite, expect PASS** (existing dreamwell tests guard behavior).

Run: `npm run typecheck && npm test`

- [ ] **Step 4: Commit** (`refactor(battle): extract shared effect-runner core from dreamwell`), then `git push`.

---

### Task 4: Rules-text hash utility

A tiny deterministic hash so the registry can detect when a card's text changes underneath a script.

**Files:**
- Create: `src/battle/automation/rules-text-hash.ts`
- Test: `src/battle/automation/rules-text-hash.test.ts`

- [ ] **Step 1: Write the failing test.** Two bug classes: (a) the hash is deterministic and stable — assert `fnv1aHex("▸Dawn: Gain 1●.")` equals the literal value you compute in Step 3 (a golden that catches an accidental algorithm change that would silently invalidate every stored hash); (b) different text yields a different hash — assert `fnv1aHex(a) !== fnv1aHex(b)` for two distinct rules strings.

- [ ] **Step 2: Run it, expect FAIL** (function undefined).

- [ ] **Step 3: Implement FNV-1a (32-bit) over UTF-16 code units, returned as zero-padded hex:**

```ts
/** FNV-1a 32-bit hash of `text`, as 8-char lowercase hex. Deterministic and
 *  dependency-free — used only to detect drift in registered card rules text,
 *  not for security. */
export function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
```

Run the test once to capture the golden value for the Step 1 assertion, then paste it in.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** (`feat(battle): add FNV-1a rules-text hash util`), then `git push`.

---

### Task 5: Battle-card effects registry + status lookup

The UUID-keyed table mirroring `DREAMWELL_EFFECTS`, plus `battleCardAutomationStatus`. Support entries are declared here but their recompute logic is Task 7–8.

**Files:**
- Create: `src/battle/automation/battle-card-effects-table.ts`
- Test: `src/battle/automation/battle-card-effects-table.test.ts`

- [ ] **Step 1: Define the types and table.** Use the shared `EffectStep`/`StepContext` from `effect-step.ts`.

```ts
export interface SupportScript {
  /** Static spark each supported front-rank ally gains from this supporter. */
  bonus: (ctx: StepContext) => number;
  /** Optional filter; defaults to all supported front-rank occupants. */
  applies?: (ally: BattleCardInstance, ctx: StepContext) => boolean;
}

export interface BattleCardEffectScript {
  id: string;                                    // card UUID; equals the map key
  trigger: "dawn" | "materialized" | "support";
  textHash: string;                              // fnv1aHex of renderedText this script targets
  steps?: EffectStep[];                          // for "dawn" | "materialized"
  support?: SupportScript;                        // for "support"
}

export const BATTLE_CARD_EFFECTS: Record<string, BattleCardEffectScript> = { /* entries below */ };
```

- [ ] **Step 2: Author the V1 entries.** For each, open `public/cards_v2-data.json`, find the card by UUID, copy its **exact** `renderedText`, and set `textHash: fnv1aHex(<that exact string>)`. Confirm the trigger text still matches before adding. V1 set:

  - **Driftcaller Sovereign** `9b9c2743-75b3-499d-b5fb-c3429c92d420` — trigger `"dawn"`, `steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }]`.
  - **Ashwalker** `1cfc72e9-b75c-4d55-8bcf-54bb301d7e40` — trigger `"materialized"`, `steps: [{ kind: "edits", build: ({ side }) => [{ kind: "ERODE", side, count: 3 }] }]`.
  - **Eternal Stag** `4e3c04a9-1cdd-468a-b42a-40157ed9c9d6` — trigger `"support"`, `support: { bonus: () => 1, applies: (ally) => ally.definition.subtype === "Spirit Animal" }`.
  - **Woodland Apparition** `1268a899-b209-46bb-bce4-6def1dcd0404` — trigger `"support"`, `support: { bonus: () => 2 }` (all supported allies; per its text "Supported allies have +2✦"). Verify the current `renderedText` still grants +2 to all supported allies before locking the script; if the text has changed, adjust `bonus`/`applies` to match or drop the entry.

  Only include a card if its current text fully matches the scripted effect. If any card above has drifted from the text quoted in the spec, either update the script to the live text or omit that entry (and note the omission) — never script an effect that disagrees with the card.

- [ ] **Step 3: Add the lookups.**

```ts
export function selectBattleCardEffectScript(cardId: string): BattleCardEffectScript | null {
  return BATTLE_CARD_EFFECTS[cardId] ?? null;
}
export function battleCardAutomationStatus(cardId: string): "auto" | "none" {
  return cardId in BATTLE_CARD_EFFECTS ? "auto" : "none";
}
```

- [ ] **Step 4: Write tests for structural invariants** (not membership). Bug classes: (a) a copy-paste error where an entry's `.id` ≠ its map key — assert `every entry: BATTLE_CARD_EFFECTS[key].id === key`; (b) a malformed entry — assert every `trigger` is one of the three literals, every `"support"` entry has a `support` and no `steps`, every `"dawn"`/`"materialized"` entry has non-empty `steps` and no `support`. Do NOT assert the table contains specific UUIDs (the drift test in Task 6 and integration QA cover presence/behavior).

- [ ] **Step 5: Run, expect PASS.**

- [ ] **Step 6: Commit** (`feat(battle): add battle-card effect registry and status lookup`), then `git push`.

---

### Task 6: Hash-drift guard (CI test + runtime warning)

This is the safeguard. **It is intentional that this test fails when a registered card's rules text changes** — that is the entire feature. It is scoped to the handful of opted-in UUIDs, so routine TOML design edits to other cards never trip it (per the `AGENTS.md` rule). Do not "fix" a real drift failure by loosening the test; re-verify the script and update the stored hash.

**Files:**
- Create: `src/battle/automation/battle-card-effects-hash.test.ts`
- Modify: `src/battle/automation/battle-card-effects-table.ts` (add a pure drift collector)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (runtime warn at battle init)

- [ ] **Step 1: Add a pure drift collector** to the table module:

```ts
/** Returns registered cards whose live renderedText no longer matches the
 *  stored hash. `cardsById` maps card UUID → its current renderedText. Cards
 *  absent from the map are reported as `actual: null` (missing from catalog). */
export function collectAutomationHashDrift(
  cardsById: ReadonlyMap<string, string>,
): { id: string; expected: string; actual: string | null }[] {
  const drift: { id: string; expected: string; actual: string | null }[] = [];
  for (const [id, script] of Object.entries(BATTLE_CARD_EFFECTS)) {
    const text = cardsById.get(id);
    const actual = text === undefined ? null : fnv1aHex(text);
    if (actual !== script.textHash) drift.push({ id, expected: script.textHash, actual });
  }
  return drift;
}
```

- [ ] **Step 2: Write the CI-gate test.** Load `public/cards_v2-data.json` from disk (Node `fs`/`readFileSync` + `JSON.parse`; follow how other tests under `src/battle/` read bundled JSON), build a `Map<string, string>` of `card.id → card.renderedText`, call `collectAutomationHashDrift`, and assert the result is empty. Bug caught: a registered card's text drifting away from its script without anyone noticing. The failure message should list the drifted UUIDs (include `JSON.stringify(drift)` in the assertion message).

- [ ] **Step 3: Run it, expect PASS** (hashes were authored from the same JSON in Task 5). If it fails now, a Task-5 hash was mis-copied — fix the hash, not the test.

- [ ] **Step 4: Wire the runtime warning.** In `PlayableBattleScreen`, on mount, load the catalog by UUID (reuse the card data already loaded for the battle, or `loadCardsV2Database()` and remap its values to `card.id → card.renderedText`) and call `collectAutomationHashDrift`. For any drift, `console.warn` once per session (guard with a module-level `let warned = false` or `logEventOnce`) listing each drifted card's UUID and name. This is a developer nudge; it must not throw or block the battle.

- [ ] **Step 5: Run lint + typecheck + test, expect PASS.**

- [ ] **Step 6: Commit** (`feat(battle): guard automated card scripts with a rules-text hash drift test and startup warning`), then `git push`.

---

### Task 7: `staticSparkBonus` field, effective spark, equality, and edit

Support spark is a distinct category from gained spark (`sparkDelta`): it applies only while the static ability holds and does not travel across zones. It needs its own field and its own edit so the recompute can set it authoritatively.

**Files:**
- Modify: `src/battle/types.ts` (`BattleCardInstance`, ~line 295)
- Modify: `src/battle/state/figments.ts` (`selectEffectiveSparkForInstance`)
- Modify: `src/battle/state/history.ts` (`areBattleMutableStatesEqual`, ~line 192)
- Modify: `src/battle/debug/commands.ts` (new edit kind, near `SET_CARD_SPARK_DELTA` at line 78)
- Modify: `src/battle/state/apply-debug-edit.ts` (new case, near line 202)
- Test: `src/battle/state/figments.test.ts` (or new), `src/battle/state/history.test.ts` (or wherever equality is tested)

- [ ] **Step 1: Write failing tests** for three bug classes:
  - *Effective spark ignores the bonus:* an instance with `staticSparkBonus: 2` reports effective spark = `printedSpark + sparkDelta + 2` (and figment stacks add it on top of member sum + `sparkDelta`), clamped ≥ 0.
  - *Equality omits the field (the known no-op gotcha):* two states identical except one instance's `staticSparkBonus` differ → `areBattleMutableStatesEqual` returns `false`. If this is missing, `SET_CARD_STATIC_SPARK_BONUS` edits silently drop.
  - *Edit applies and early-returns:* applying `SET_CARD_STATIC_SPARK_BONUS` to value V sets the field to V; applying it again with the same V is a no-op transition (mirrors `SET_CARD_SPARK_DELTA` at `apply-debug-edit.ts:202–214`).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**
  - In `BattleCardInstance` add `staticSparkBonus: number;` (initialize to `0` everywhere instances are constructed — the compiler flags each site; new cards enter play with `0`).
  - In `selectEffectiveSparkForInstance`, add `instance.staticSparkBonus` into both the figment branch (`memberSpark + instance.sparkDelta + instance.staticSparkBonus`) and the non-figment branch (`printedSpark + sparkDelta + staticSparkBonus`), keeping the `Math.max(0, …)` clamp.
  - In `areBattleMutableStatesEqual`, add to the per-instance comparison (after the `sparkDelta` line):

```ts
      leftInstance.staticSparkBonus !== rightInstance.staticSparkBonus ||
```

  - In `commands.ts`, add the edit kind beside `SET_CARD_SPARK_DELTA`:

```ts
  | {
    kind: "SET_CARD_STATIC_SPARK_BONUS";
    battleCardId: string;
    value: number;
  }
```

  Add it to every `case "SET_CARD_SPARK_DELTA":` grouping in `commands.ts` (lines ~476, ~582, ~664 — log/target/validation switches) so the new kind is handled identically where spark-delta is.
  - In `apply-debug-edit.ts`, add a `case "SET_CARD_STATIC_SPARK_BONUS":` modeled exactly on the `SET_CARD_SPARK_DELTA` case (undefined-instance guard, equal-value early return, then assign `nextState.cardInstances[edit.battleCardId].staticSparkBonus = edit.value`).

- [ ] **Step 4: Run lint + typecheck + test, expect PASS.**

- [ ] **Step 5: Commit** (`feat(battle): add staticSparkBonus field and SET_CARD_STATIC_SPARK_BONUS edit for Support`), then `git push`.

---

### Task 8: Support recompute pure function

A pure function the runner calls on every board change. Setting the field to the **absolute** computed total (not a delta) is what makes it idempotent and prevents loops.

**Files:**
- Modify: `src/battle/automation/battle-card-effects-table.ts` (add geometry constant + recompute fn)
- Test: `src/battle/automation/support-recompute.test.ts`

- [ ] **Step 1: Add the geometry constant** (from `battle_rules.md:163–167`):

```ts
import { type BackRankSlotId, type FrontRankSlotId } from "../types";

export const SUPPORT_ADJACENCY: Record<BackRankSlotId, FrontRankSlotId[]> = {
  B0: ["F0"], B1: ["F0", "F1"], B2: ["F1", "F2"], B3: ["F2", "F3"], B4: ["F3"],
};
```

- [ ] **Step 2: Write failing tests** covering these bug classes (build small `BattleMutableState` fixtures; reuse existing battle test factories if present):
  - *Geometry correctness:* a supporter in `B1` with `bonus → 1` grants +1 to occupants of `F0` and `F1` only — not `F2`/`F3`. Catches an adjacency table error.
  - *Predicate filter:* an Eternal-Stag-style `applies: subtype === "Spirit Animal"` supporter grants the bonus only to spirit-animal front allies, 0 to others.
  - *Stacking:* two supporters covering the same front slot sum their bonuses on that ally.
  - *Supporter removed / ally moved out of a supported slot → target 0* for the no-longer-supported ally.
  - *Idempotence:* running recompute on a state whose `staticSparkBonus` already equals the computed targets produces **zero** edits. This is the property that proves the runner won't loop.
  - *Disabled → all-zero:* with `enabled = false`, every instance's target is 0 (so the runner clears any prior bonus).

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Implement the recompute.**

```ts
/** Computes the SET_CARD_STATIC_SPARK_BONUS edits needed to bring every
 *  instance's staticSparkBonus to its correct Support total. Returns only the
 *  edits where the target differs from the current value (idempotent — no edits
 *  when already correct). When `enabled` is false, every target is 0. */
export function planSupportRecompute(
  state: BattleMutableState,
  enabled: boolean,
  nowMs: number,
): BattleDebugEdit[]
```

  Algorithm: build a `Map<battleCardId, number>` target defaulting every in-play instance to 0. When `enabled`, for each side, for each back-rank slot holding a supporter whose UUID has a `"support"` script, look up `SUPPORT_ADJACENCY[slot]`, and for each occupied supported front slot whose occupant passes `applies` (default true), add `bonus(ctx)` to that occupant's target. Then for every in-play instance, if `target !== instance.staticSparkBonus`, emit `{ kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId, value: target }`. Resolve a supporter's UUID via `instance.definition.cardId` (Task 1). Build `ctx` as `{ side, state, random: Math.random, nowMs }` (matches `StepContext`).

- [ ] **Step 5: Run, expect PASS.**

- [ ] **Step 6: Commit** (`feat(battle): add Support static-spark recompute`), then `git push`.

---

### Task 9: `useBattleEffectRunner` hook + wiring

The timing layer: fire Dawn scripts on Dawn entry, Materialized scripts on board entry, run Support recompute on board change, all routed through the shared execution core and overlays. Extract the trigger-detection logic as pure functions so it is testable without React.

**Files:**
- Create: `src/battle/automation/use-battle-effect-runner.ts`
- Test: `src/battle/automation/battle-effect-triggers.test.ts` (pure detection helpers)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (instantiate the hook, render its prompt overlays)

- [ ] **Step 1: Write failing tests for the pure detection helpers** (defined in the hook module or a sibling, exported for test):
  - `selectDawnTriggerScripts(state)` → for `state.phase === "dawn"`, returns the active side's in-play instances (front + back) whose `cardId` has a `"dawn"` script, in a stable slot order. Bug caught: wrong side fired, or ordering nondeterminism that would make Dawn resolution unstable.
  - `detectNewlyMaterialized(seenIds, state)` → given the set of previously-seen in-play instance ids and current state, returns instances now in play (any rank) whose `cardId` has a `"materialized"` script and whose id is not in `seenIds`. Bug caught: a materialized effect firing twice (id already seen) or never (not detected on entry).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement the hook**, modeled on `use-dreamwell-effect-runner.ts`:
  - **Args:** `{ enabled: boolean; state: BattleMutableState; dispatchEdit: (edit: BattleDebugEdit) => void }`. **Returns** the same `{ activePrompt, activePromptSide, resolvePrompt }` shape (reusing `ActivePrompt`/`PromptResolution` from `effect-runner-core.ts`) so the existing overlays render battle-effect prompts.
  - **Execution** reuses `planNextEffectStep` / `applyPromptResolution`. The run/queue/`pausedRef`/`processedQueueRef`/abort-and-clear logic is the same shape as the dreamwell hook (one run at a time; multiple queued triggers serialize). Use the same double-dispatch and abort guards.
  - **Dawn timing:** when `enabled`, `state.result === null`, and `state.phase === "dawn"`, gate once per `(activeSide, turnNumber)` with a `dawnRunKeyRef` (same pattern as `lastRunKeyRef`), enqueue the concatenated steps of `selectDawnTriggerScripts(state)`, and run them. **Hold the phase auto-advance** while a run or prompt is active: expose `isBusy` (run !== null || activePrompt !== null) and have `PlayableBattleScreen` suppress automation's bookend phase-advance while `battleRunner.isBusy` — OR, simpler and self-contained, dispatch the dawn steps before the phase-advance automation observes an empty stack. Implement the `isBusy` gate; document it where the phase auto-advance is decided.
  - **Materialized timing:** keep a `seenInPlayRef: Set<string>`. On each render, compute `detectNewlyMaterialized(seenInPlayRef.current, state)`; for each, enqueue its steps (serially, after any active run) and add its id to the set. Remove ids that leave play so a re-materialized instance (new id) re-fires; a given instance id fires at most once. Materialized runs for the instance's `controller`.
  - **Support recompute:** a `useEffect` depending on the rank occupancy + `cardInstances` (and `enabled`) that calls `planSupportRecompute(state, enabled, Date.now())` and dispatches each returned edit. Because recompute returns only diffs, it self-terminates after one pass.
  - **Logging — one entry per automation action, never per render or per step** (`BATTLE_EFFECT_LOG` constant + `logBattleEffect` wrapper, mirroring `use-dreamwell-effect-runner.ts:41–59`, `sourceSurface: "auto-system"`). The reconstruct-the-algorithm standard is met by a single rich summary entry, not a stream of step entries:
    - **One `battle_proto_battle_effect_resolved` entry when a single card's Dawn or Materialized script finishes resolving** — fields: `cardId`, `cardName`, `trigger`, `side`, the aggregated `editKinds` + `targetIds` the script produced, and any prompt `choice`(s). Do NOT emit separate started/per-step entries. (A Dawn phase firing N characters' triggers yields N such entries — one per resolved character script — which still maps to discrete board effects, not per-render noise.)
    - **One `battle_proto_battle_support_changed` entry only when `planSupportRecompute` returns a non-empty edit list**, summarizing the changed `{ battleCardId, value }` set. **Never log a no-op recompute pass** (the common case on most renders) — gate the log on `edits.length > 0`.

- [ ] **Step 4: Wire into `PlayableBattleScreen`.** Instantiate `useBattleEffectRunner` next to `useDreamwellEffectRunner` (reuse `dispatchAutomationEdit`). Render its `activePrompt` through the **same** overlay components used at `PlayableBattleScreen.tsx:870–896` (`BattleCardPickerOverlay`, `BattleChoicePromptOverlay`, `BattleForeseeOverlay`), bound to `battleRunner.resolvePrompt`. Ensure only one prompt overlay shows at a time (dreamwell and battle prompts cannot both be open; if needed, prefer whichever runner is busy).

- [ ] **Step 5: Run lint + typecheck + test, expect PASS.**

- [ ] **Step 6: Commit** (`feat(battle): add battle-effect runner for Dawn, Materialized, and Support automation`), then `git push`.

---

### Task 10: Gear icon

White-filled, black-outlined gear, ~energy-pip sized, under `.c-cost`, shown only while automation is on, on battlefield + hand + dreamwell cards.

**Files:**
- Modify: `src/battle/components/BattleCardView.tsx` (render gear under `.c-cost` at line ~174)
- Modify: `src/battle/battle.css` (new `.c-automation-gear`, near `.c-cost` at line 927)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (pass the gear flag from each card-render site)
- Test: `src/battle/components/BattleCardView.test.tsx` (or existing) — light render assertion

- [ ] **Step 1: Add a prop** `showAutomationGear?: boolean` to `BattleCardView`. When true, render an inline SVG gear element with `className="c-automation-gear"` as a sibling of `.c-cost` inside `.c-top` (so it sits directly beneath the energy pip). The SVG uses `fill="#fff"` with `stroke="#000"` so it reads as white-filled/black-outlined at small size; give it an `aria-label="automated"`.

- [ ] **Step 2: Add CSS** `.battle-card .c-automation-gear` positioned absolutely just below `.c-cost` (match the cost pip's left offset; place it one pip-height lower), sized ~the cost pip's dimensions. Add a `.battle-card.hand-card .c-automation-gear` override mirroring the `.hand-card .c-cost` adjustments (line ~1097) so hand cards align too. Verify no overlap with `.c-spark`, `.c-exhausted`, or `.c-figment-count`.

- [ ] **Step 3: Wire the flag at every card-render site.** Pass `showAutomationGear={isBasicAutomationEnabled && battleCardAutomationStatus(<instance.definition.cardId>) === "auto"}` for battlefield and hand cards. For the dreamwell display card, pass `isBasicAutomationEnabled && dreamwellAutomationStatus(card.id) !== "none"` (gear shows for both auto and manual; the existing Auto/Manual text badge still distinguishes them). The gear must never show when `isBasicAutomationEnabled` is false.

- [ ] **Step 4: Write a light render test.** Bug class: the gear leaking when it shouldn't. Assert `BattleCardView` renders an element with `aria-label="automated"` when `showAutomationGear` is true and renders none when false/absent. Do not snapshot the SVG path.

- [ ] **Step 5: Run lint + typecheck + test, expect PASS.**

- [ ] **Step 6: Commit** (`feat(battle): show automation gear icon on automation-capable cards`), then `git push`.

---

### Task 11: Browser QA

Validate the integrated feature through the real player workflow per `AGENTS.md`/the journey-battle QA setup. **Start the QA Vite server on a non-default port** (e.g. `npm run dev -- --port 5174`), capture its PID, and at teardown kill **only** that process (`pkill -f "vite --port 5174"` or by PID) — never a broad `pkill -f vite`.

- [ ] **Step 1:** Launch the QA server on port 5174 and drive a battle with basic automation **on** (per the battle browser-QA setup: copy `.env`, run setup-assets, click "Create Game").

- [ ] **Step 2: Gear visibility.** Confirm the gear renders under the energy pip on automation-capable cards in hand, on the battlefield, and on the dreamwell display, and **only** while automation is on (toggle it off → gear disappears everywhere; on → reappears). Check no clipping/overlap with cost, spark, exhausted, or figment-count badges at the tested viewport(s).

- [ ] **Step 3: Dawn.** Have a Driftcaller-Sovereign-style ▸Dawn character in play and advance into the controller's Dawn; confirm the energy gain resolves automatically and the turn proceeds (phase advance waited for the effect). Inspect the captured error buffer for render errors / unhandled rejections / console errors.

- [ ] **Step 4: Materialized.** Play Ashwalker; confirm Erode 3 fires once on entry (void grows by 3 / fatigue if empty) and does not re-fire on later renders.

- [ ] **Step 5: Support.** Place a Support character (Eternal Stag / Woodland Apparition) in a back-rank slot supporting an occupied front slot; confirm the supported ally's displayed spark increases by the right amount, that it updates when the supporter or the supported ally moves/leaves, that the predicate (spirit-animal-only) is respected, and that toggling automation off clears the bonus.

- [ ] **Step 6:** Tear down only the port-5174 server. Record QA findings (what was exercised, screenshots if useful, any issues) in the final summary.

---

## Self-review notes

- **Spec coverage:** trigger scope (Dawn/Materialized/Support) → Tasks 5,8,9; gear (3 views, automation-on only) → Task 10; hash safeguard (runtime warn + scoped test) → Task 6; shared-engine extraction (Approach C) → Tasks 2–3; Support continuous layer (new field, effective spark, equality, edit, recompute) → Tasks 7–8; logging → Task 9; testing matrix → per-task; UUID-keyed identification → Task 1. All spec sections map to tasks.
- **Hash test vs the "don't test TOML design data" rule:** addressed explicitly in Task 6 — the test is scoped to opted-in UUIDs and the drift failure is the intended safeguard, not a brittle design-data assertion.
- **Type consistency:** `cardId` (definition), `staticSparkBonus` (instance), `SET_CARD_STATIC_SPARK_BONUS` (edit), `EffectStep`/`EffectPrompt`/`StepContext`/`planNextEffectStep`/`ActivePrompt`/`PromptResolution` (shared core), `BattleCardEffectScript`/`SupportScript`/`battleCardAutomationStatus`/`selectBattleCardEffectScript`/`collectAutomationHashDrift`/`planSupportRecompute`/`SUPPORT_ADJACENCY` (registry), `fnv1aHex` (hash) — used consistently across tasks.
- **Test value:** registry tests assert structural invariants (key===id, trigger/shape) not membership; recompute tests pin geometry/idempotence/predicate bug classes; the hash test is the drift gate; the gear test guards leakage. No table-mirror or per-magic-number tests.
