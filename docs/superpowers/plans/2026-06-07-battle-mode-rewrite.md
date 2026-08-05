# Battle Mode Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild journey-prototype battle mode (`src/battle/`) to match the current `docs/battle_rules/battle_rules.md` and `data/tabula/cards.toml` as a manual sandbox with structural automation — correct terminology, discrete figment stacking, exhaust/awaken, counters, energy-track Dreamwell, expanded Basic Automation defaulted ON, an updated debug rail, and an enemy AI adapted to the new model — with **no card-text interpretation** (players resolve their own card effects).

**Architecture:** Keep the model-agnostic shell (controller/history/undo, the `BattleCommand`/`DEBUG_EDIT` envelope, logging, React components). Rebuild the model-bound semantics: rename the board to front/back rank, add card-instance status state, replace the integer figment count with discrete figments, model an energy track + Dreamwell/Draw step, unify the two divergent Challenge resolvers into one keyword-aware engine, broaden Basic Automation, refresh the debug rail, and re-point the AI. Structural automation expands one UI gesture into an ordered list of `DEBUG_EDIT`s (undoable), acting only on card *fields* and board *state*, never card prose.

**Tech Stack:** TypeScript 5.8 (strict, bundler resolution — no Node built-ins in typechecked code), React 19, Vite 7, Vitest 4, ESLint. Run all checks from the repo root of this worktree (`.claude/worktrees/battle-mode-rewrite`). `node_modules` is not committed.

**Authoritative references (read before starting):**
- Spec: `docs/superpowers/specs/2026-06-07-battle-mode-rewrite-design.md`
- Mechanics coverage checklist: `docs/superpowers/specs/2026-06-07-battle-mode-card-mechanics-checklist.md`
- Rules: `docs/battle_rules/battle_rules.md`

**Conventions for every task:** TDD — write the failing test first, watch it fail, implement minimally, watch it pass, commit. Vitest files are co-located `*.test.ts(x)`. Commit after each green task with a detailed message; do not bundle unrelated files. Per-phase exit gate: `npm run lint && npm run typecheck && npm test` all green (plus browser QA where noted).

**Two deviations from the spec, flagged for the reviewer:**
1. **Support reaches the resolver as structured spark data.** Effective spark = structural base (printed / discrete figment) + `sparkDelta` + `staticSparkBonus` + an optional `supportContribution` map supplied by the caller. The static contribution applies once to each figment, while the AI's caller-supplied contribution carries the stack's total Support bonus. Card prose remains presentation data rather than a rules input.
2. **Challenger/defender designation snapshotting (spec §4.3) is deferred.** The resolver reads live front-rank positions at Challenge time. In a sandbox the player sets final positions before Challenge, so this is behaviorally correct; full end-of-Day / end-of-Dusk designation capture is left as a future enhancement (noted in §Phase 3).

---

## File Structure

**New files**
- `src/battle/state/figment-catalog.ts` — the 14 figment types (base spark + implicit keyword); single source of truth for figment defaults. Test: `figment-catalog.test.ts`.
- `src/battle/engine/challenge.ts` — the one authoritative Challenge resolver (keyword-aware, discrete-figment-correct, support-map aware). Test: `challenge.test.ts`.

**Heavily modified**
- `src/battle/types.ts` — slot ids, zone names, phase union, new `BattleCardInstance` status fields, discrete-figment field.
- `src/battle/state/figments.ts` — discrete-figment model (replaces integer `figmentCount`).
- `src/battle/state/create-initial-state.ts` — slot init, status-field defaults, figment init.
- `src/battle/state/apply-debug-edit.ts` — slot/zone renames, new edit kinds, positional rules, status edits.
- `src/battle/debug/commands.ts` — new `BattleDebugEdit` kinds, label/zone-name updates.
- `src/battle/engine/{support,energy,handoff}.ts` — id renames, configurable ramp, Dreamwell/Draw step.
- `src/battle/engine/judgment.ts` — becomes a shim over `challenge.ts`, removed in Phase 5.
- `src/battle/automation/basic-automation.ts` — v2 breadth; delegates Challenge to `challenge.ts`.
- `src/runtime/runtime-config.ts` — `basicAutomation` flag (default on).
- `src/battle/components/PlayableBattleScreen.tsx` — automation default, phase-control sequence, relabels, new rail wiring.
- `src/battle/components/{BattleInspector,BattleContextMenu,BattleFigmentCreator,BattlefieldGrid,BattleStatusStrip,BattleSideSummaryPopover,battle-ui-commands}.tsx/ts` — relabels + new rail tools.
- `src/battle/ai/*` — slot/phase/figment/resolver re-point; Starter per-card model name refresh.
- `docs/battle_rules/battle_rules.md`, `docs/journey_prototype/{journey_prototype.md,battle_ai.md,url_parameters.md}` — doc updates.

**Untouched shell (do not restructure):** `state/history.ts`, `state/controller.ts`, `state/transition.ts`, `state/reducer.ts`, `debug/apply-command.ts` envelope, logging, provenance/notes/markers.

---

## Phase 0 — Baseline & rules doc

### Task 0.1: Establish a green baseline in the worktree

**Files:** none (environment).

- [ ] **Step 1:** From the worktree root, run `npm install` (node_modules is not committed). Expected: completes; `setup-assets.mjs` may run on later dev commands.
- [ ] **Step 2:** Run `npm run lint && npm run typecheck && npm test`. Expected: all green. This is the regression baseline; if anything is red here it predates this work — record it and proceed.
- [ ] **Step 3:** No commit (no file changes).

### Task 0.2: Document Phasing in the rules

**Files:** Modify `docs/battle_rules/battle_rules.md` (the Keywords and Effects section).

The user-provided definition: Phasing = *▸Materialized: Return another ally to hand, then move this character to that ally's position.* It is an ordinary `▸Materialized` trigger; no new engine concept.

- [ ] **Step 1:** Add a **Phasing** entry to the keyword list near the other keywords, stating the definition above and that it is resolved through the normal return-to-hand + reposition tools.
- [ ] **Step 2:** Verify no "no longer / removed" phrasing was introduced (repo doc style rule).
- [ ] **Step 3:** Commit: `docs(battle): define Phasing keyword in battle rules`.

---

## Phase 1 — Model & types

This phase is mostly contract changes that ripple across the module; lean on `npm run typecheck` to find every consumer. Commit each task only when typecheck + the full test suite are green.

### Task 1.1: Rename battlefield slot identifiers (R/D → B/F)

**Files:** Modify `src/battle/types.ts`; then every consumer the compiler flags (notably `state/figments.ts`, `engine/support.ts`, `engine/judgment.ts`, `automation/basic-automation.ts`, `state/apply-debug-edit.ts`, `state/selectors.ts`, `ai/*`, `components/*`). Tests: existing suite is the safety net.

The rename — back rank is 5 slots, front rank is 4 (counts already match today's reserve/deploy):

```ts
export const BACK_RANK_SLOT_IDS = ["B0", "B1", "B2", "B3", "B4"] as const;
export const FRONT_RANK_SLOT_IDS = ["F0", "F1", "F2", "F3"] as const;
export type BackRankSlotId = (typeof BACK_RANK_SLOT_IDS)[number];
export type FrontRankSlotId = (typeof FRONT_RANK_SLOT_IDS)[number];
export type BattlefieldSlotId = BackRankSlotId | FrontRankSlotId;
```

This is a pure identifier rename: `RESERVE_SLOT_IDS`→`BACK_RANK_SLOT_IDS`, `DEPLOY_SLOT_IDS`→`FRONT_RANK_SLOT_IDS`, `ReserveSlotId`→`BackRankSlotId`, `DeploySlotId`→`FrontRankSlotId`, and the string values `R0..R4`→`B0..B4`, `D0..D3`→`F0..F3` everywhere they appear as literals (e.g. `support.ts` map keys, `create-initial-state.ts` empty-slot literals). No behavior change.

- [ ] **Step 1:** Update `types.ts` to the names above; keep the old names as **deprecated re-exports** (`export const RESERVE_SLOT_IDS = BACK_RANK_SLOT_IDS;` etc.) so consumers compile while you migrate. Run `npm run typecheck` — expect green (aliases bridge).
- [ ] **Step 2:** Migrate consumers file-by-file to the new names and the `B*/F*` literals. Re-run `npm run typecheck` after each file. The string-literal slot values change, so also update any test fixtures that hard-code `"D0"`, `"R0"`, etc.
- [ ] **Step 3:** Remove the deprecated aliases. Run `npm run typecheck && npm test`. Expected: green; failures pinpoint a missed literal.
- [ ] **Step 4:** Commit: `refactor(battle): rename battlefield slots to front/back rank (F/B)`.

**Test note:** no new tests — this is a rename; the existing suite catches a missed site via type error or a fixture mismatch. Adding assertions that "the constant equals `['B0'...]`" would be a table-mirror test; skip it.

### Task 1.2: Rename battlefield zones (reserve/deployed → backRank/frontRank)

**Files:** Modify `src/battle/types.ts` (`BattleZoneId`, `BattlefieldZone`, `BattleSideMutableState`, `BattleFieldSlotAddress`), `state/create-initial-state.ts`, `state/apply-debug-edit.ts`, `state/figments.ts`, `state/selectors.ts`, `debug/commands.ts` (`makeZoneTarget`, `formatZoneLabel`), components, `ai/*`.

`BattleSideMutableState.reserve`/`deployed` → `backRank`/`frontRank`; `BattlefieldZone = "backRank" | "frontRank"`; `BattleZoneId` swaps those two members; `BattleFieldSlotAddress.zone` follows. UI labels become "Back Rank" / "Front Rank".

- [ ] **Step 1:** Rename the type members and the two `Record<…SlotId,…>` fields. Typecheck will flag every read/write (`state.sides[side].deployed[slotId]` → `.frontRank[slotId]`, etc.). Migrate them.
- [ ] **Step 2:** Update `formatZoneLabel` / `makeZoneTarget` in `commands.ts` to the new zone strings and human labels ("Back Rank"/"Front Rank").
- [ ] **Step 3:** `npm run typecheck && npm test`. Update any fixture/snapshot referencing the old zone strings or "Reserve"/"Deployed" labels.
- [ ] **Step 4:** Commit: `refactor(battle): rename battlefield zones to front/back rank`.

### Task 1.3: Modernize the phase model

**Files:** Modify `src/battle/types.ts` (`BattlePhase`), `state/create-initial-state.ts`, `components/PlayableBattleScreen.tsx` (`PHASE_CONTROL_SEQUENCE`, `normalizePhaseForControls`, `computePhaseControlTarget`), `ui/format.ts` (`formatPhaseLabel`), any phase fixtures.

Target union (drop the five legacy names `startOfTurn`/`draw`/`main`/`judgment`/`endOfTurn`):

```ts
export type BattlePhase =
  | "dreamwell" | "draw" | "dawn" | "day" | "dusk" | "night" | "challenge" | "ending";
```

Note `draw` already exists and stays; `dreamwell` is new. The UI's five surfaced phases remain Dawn/Day/Dusk/Night/Challenge; Dreamwell/Draw/Ending are auto-advance bookends (Phase 2 wires the advance). Initial `phase` becomes `"day"` (unchanged start point for turn 1).

- [ ] **Step 1:** Replace the union. Typecheck flags every `switch`/comparison on the removed names (notably `normalizePhaseForControls`, which currently maps legacy→new). Simplify those: the mapping becomes identity for surfaced phases; `dreamwell`/`draw`/`ending` map to their neighbor for control display.
- [ ] **Step 2:** Update `formatPhaseLabel` to label all eight.
- [ ] **Step 3:** `npm run typecheck && npm test`. Update phase fixtures.
- [ ] **Step 4:** Commit: `refactor(battle): adopt the 8-phase rules model`.

**Test note:** add ONE test in `PlayableBattleScreen.test.tsx` only if the control-sequence mapping has non-obvious branches (e.g. `dreamwell`/`ending` resolve to a surfaced chip). Pin the mapping behavior, not the label strings.

### Task 1.4: Add card-instance status state

**Files:** Modify `src/battle/types.ts` (`BattleCardInstance`), `state/create-initial-state.ts` (defaults in `allocateBattleCardInstance` + `cloneBattleMutableState`), `state/figments.ts` (clone path if any). Test: `src/battle/state/create-initial-state.test.ts` (extend) or a new `card-status.test.ts`.

Add a single grouped status object so clone/create churn stays in one place:

```ts
export interface BattleCardStatus {
  isExhausted: boolean;
  counters: number;        // ⧗ stored on this card; resets to 0 when it leaves play
  reclaimed: boolean;
  offering: boolean;
  ephemeral: boolean;
  veil: number;            // Veil N● targeting tax; 0 = no veil
  // Granted combat keywords (for non-figment characters an effect grants one).
  // The resolver also text-scans printed keywords and reads figment types.
  grantedVengeful: boolean;
  grantedAwakened: boolean;
}
```

Add `status: BattleCardStatus` to `BattleCardInstance`. Default factory: everything false/0. Wire the default into `allocateBattleCardInstance`, and deep-copy `status` in `cloneBattleMutableState` (alongside `markers`).

- [ ] **Step 1:** Write a failing test: a freshly allocated instance has `status` with all-false/0 defaults; and `cloneBattleMutableState` produces an independent `status` object (mutating the clone's `status.counters` does not affect the original). Bug class: shared-reference aliasing across history snapshots (would corrupt undo).
- [ ] **Step 2:** Run it — fails (`status` undefined).
- [ ] **Step 3:** Add the interface, the default factory, the field, and the clone copy.
- [ ] **Step 4:** Run the test — passes. Then `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `feat(battle): add per-card status state (exhaust, counters, persistent keywords)`.

**Note on the exhaust proxy:** keep `enteredPlayTurnNumber` for now (the AI reads it); `status.isExhausted` becomes the authoritative flag that Phase 2's Dawn automation clears. Reconcile/remove the proxy in Phase 5 when the AI is re-pointed.

### Task 1.5: Discrete figment representation

**Files:** Modify `src/battle/types.ts` (`BattleCardInstance.figmentCount` → discrete field), `state/figments.ts` (rewrite), `state/create-initial-state.ts` (figment init + clone), `state/apply-debug-edit.ts` (`CREATE_FIGMENT` + add-to-stack + dissolve paths). Test: `src/battle/state/figments.test.ts` (new).

Replace the integer with a per-figment spark array (the type/keyword comes from `definition.subtype`; identity beyond spark is unneeded for the sandbox):

```ts
// On BattleCardInstance, replacing `figmentCount?: number`:
figments?: number[];   // each member's current spark, kept sorted descending (top = index 0)
```

Rewrite `figments.ts` over the array:
- `selectFigmentCount(i)` = `i.figments?.length ?? 1` (1 for non-figments).
- `selectEffectiveSparkForInstance(i)`: non-figment = `max(0, printedSpark + sparkDelta)`; figment = `sum(figments.map(s => max(0, s)))`. (For figments, pumps live in the array; `sparkDelta` is unused — see add path.)
- `selectFigmentChallengeLossCount(i, opposingSpark)`: walk the descending array accumulating spark; return the count whose cumulative total first reaches `opposingSpark`; this is now exact for heterogeneous sparks (no synthetic uniform-spark assumption).
- `addFigmentsToStackInPlace`: push N new members (at a given base spark) and re-sort descending.
- `dissolveFigmentsFromStackInPlace`: drop the top `k` members (highest spark first, matching the loss order); return true when the array empties.
- `canMergeFigments` / `findBattlefieldFigmentStack`: unchanged logic, but iterate `BACK_RANK_SLOT_IDS`/`FRONT_RANK_SLOT_IDS` and `backRank`/`frontRank`.

Single-target effects (pump/dissolve-one/abandon) act on `figments[0]` (the top), per rules §Targeting/§Figments.

- [ ] **Step 1:** Write failing golden tests from `battle_rules.md` §Figments worked examples. Bug class: off-by-one in top-down loss accounting and wrong handling of heterogeneous spark:
  - `[2,2,2,2,2]` vs opposing 5 → loss count 2 (survivors `[2,2,2]`); and the opposing 5✦ dissolves (stack total 10 ≥ 5).
  - `[2,2,2]` vs 5 → loss count 2 (keep `[2,2]`)... per the rules example a 3×2 stack vs 5 "loses two and keeps one" → loss count 2, survivors `[2]`. Encode the rules' stated outcome.
  - `[1,1,1,1,1]` vs 5 → loss count 5 (entirely dissolved, tie).
  - Heterogeneous `[3,1]` vs 3 → loss count 1 (top 3 absorbs 3; survivor `[1]`).
- [ ] **Step 2:** Run — fails (functions still integer-based).
- [ ] **Step 3:** Implement the array-based functions; update `allocateBattleCardInstance` to init `figments: [printedSpark]` for figment provenance, and `cloneBattleMutableState` to copy the array.
- [ ] **Step 4:** Run the golden tests — pass. Then update `apply-debug-edit.ts` `CREATE_FIGMENT`/add/dissolve to the array model and run `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `feat(battle): represent figment stacks as discrete heterogeneous figments`.

### Task 1.6: 14-type figment catalog

**Files:** Create `src/battle/state/figment-catalog.ts`; modify `state/apply-debug-edit.ts` (`CREATE_FIGMENT` resolves catalog defaults), `components/BattleFigmentCreator.tsx` (Phase 4 consumes it). Test: `src/battle/state/figment-catalog.test.ts`.

Encode the rules §Figments table — base spark + implicit keyword — for: Warrior 1, Ancient 4, Enigma 0, Shadow 2, Spirit Animal 1, Synth 0 (Support +1✦), Monstrosity 4, Survivor 1, Celestial 2, Wraith 0 (Vengeful), Ethereal 1, Radiant 2, Ember 1 (Awakened), Outsider 1. Export a lookup keyed by normalized subtype returning `{ baseSpark, keyword? }`.

- [ ] **Step 1:** Write a failing test pinning the **invariants**, not each row by value: all 14 types are present (count === 14); every base spark is a non-negative integer; the keyword set is exactly {synth→support, wraith→vengeful, ember→awakened} and the other eleven carry no keyword. Bug class: a missing type, a typo'd subtype key, or a misassigned keyword. (Use a snapshot of the rendered catalog table if you prefer locking exact base sparks; do not write 14 per-row `toBe` asserts.)
- [ ] **Step 2:** Run — fails (module absent).
- [ ] **Step 3:** Implement the catalog; have `CREATE_FIGMENT` default `chosenSpark` to the catalog base when the caller passes a sentinel/omits it, and stamp the keyword onto `status.granted*` for the matching figment.
- [ ] **Step 4:** Run — passes; `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `feat(battle): add the 14-type figment catalog`.

### Task 1.7: Enforce the exhausted-can't-advance positional rule

**Files:** Modify `src/battle/state/apply-debug-edit.ts` (`SWAP_BATTLEFIELD_SLOTS` and the battlefield-destination branch of `MOVE_CARD_TO_ZONE`). Test: extend `src/battle/state/apply-debug-edit.test.ts`.

Rules §The Play Area: an exhausted character cannot be moved to the front rank by either player. (The ☾-pay auto-retreat is wired with the exhaust tool in Phase 4.)

- [ ] **Step 1:** Write a failing test: moving/swapping an exhausted (`status.isExhausted === true`) character into a `frontRank` slot leaves state unchanged (the move is rejected); a non-exhausted character moves normally; moving an exhausted character within the back rank is allowed. Bug class: an exhausted body sneaking into combat.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Guard the front-rank destination in both edit handlers: if the moving instance is exhausted and the destination zone is `frontRank`, return state unchanged.
- [ ] **Step 4:** Run — passes; `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `feat(battle): block exhausted characters from advancing to the front rank`.

**Phase 1 exit gate:** `npm run lint && npm run typecheck && npm test` green.

---

## Phase 2 — Energy track & automation v2

### Task 2.1: Configurable energy ramp + Dreamwell/Draw step

**Files:** Modify `src/battle/engine/energy.ts`, `engine/handoff.ts`, `state/create-initial-state.ts` (`OPENING_ENERGY`). Test: `src/battle/engine/energy.test.ts`.

Keep the SET_MAX-then-SET_CURRENT ordering (preserves current ≤ max). Make the ramp a named, documented schedule rather than an inline formula, with the opening value a constant. Default schedule preserves today's effective curve: `target(turn) = min(openingValue + (turn - 1), maxEnergyCap)` with `openingValue = 2`.

- [ ] **Step 1:** Write failing tests pinning **invariants**, not the literal per-turn numbers: the schedule is non-decreasing in `turnNumber`; it never exceeds `maxEnergyCap`; turn 1 yields `openingValue`; `SET_MAX_ENERGY` precedes `SET_CURRENT_ENERGY` in the returned edits. Bug class: a regression that lets current exceed max, or an off-by-one that changes opening energy. (Do not assert `ramp(3) === 4` — that's a tunable constant; the invariant covers it.)
- [ ] **Step 2:** Run — adjust until the new structure is exercised (some invariants may already hold; ensure the ordering + cap + monotonic tests are present and pass against the refactor).
- [ ] **Step 3:** Refactor `energy.ts` to the named schedule; keep `energyRampEdits(side, turnNumber, maxEnergyCap)` signature stable so `handoff.ts` is untouched here.
- [ ] **Step 4:** `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `refactor(battle): express energy ramp as a configurable Dreamwell schedule`.

### Task 2.2: `automation` runtime flag (default ON)

**Files:** Modify `src/runtime/runtime-config.ts` (`RuntimeConfig` + `parseRuntimeConfig`). Test: `src/runtime/runtime-config.test.ts`.

Mirror `aiMode` exactly (default on, only `=0` disables):

```ts
// in RuntimeConfig:
basicAutomation: boolean;
// in parseRuntimeConfig:
basicAutomation: params.get("automation") !== "0",
```

- [ ] **Step 1:** Write a failing round-trip test: absent / `automation=1` / `automation=true` / `automation=` → `true`; only `automation=0` → `false`. Bug class: inverted default (the whole point is default-ON).
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Add the field + parse line.
- [ ] **Step 4:** Run — passes; `npm run typecheck`.
- [ ] **Step 5:** Commit: `feat(runtime): add automation flag (default on) to runtime config`.

(The default is wired into the screen in Phase 6 so the manual-sandbox tests stay green until the intended flip.)

### Task 2.3: Basic Automation v2 — Dawn exhaust-clear

**Files:** Modify `src/battle/automation/basic-automation.ts`. Test: `src/battle/automation/basic-automation.test.ts`.

When the turn handoff brings a side to its turn, that side's characters clear `isExhausted` (rules §Dawn). The cleanest hook is the existing `planTurnHandoff`: append, for each in-play character of the incoming side, a status edit clearing exhaustion. **Introduce the status edit here** (its toggle UI and the ☾ auto-retreat behavior come in Task 4.1):

```ts
| { kind: "SET_CARD_STATUS"; battleCardId: string; status: Partial<BattleCardStatus> }
```

Its handler merges the partial into the instance's `status`. Add it to `debug/commands.ts` (label / targets / kind — the `switch`es are exhaustive over the union, so typecheck flags every function needing a case) and to `state/apply-debug-edit.ts`.

- [ ] **Step 1:** Write a failing test: after the handoff automation for the incoming side, every in-play (front or back rank) character of that side has `status.isExhausted === false`, and the outgoing side's exhaustion is untouched. Bug class: clearing the wrong side, or missing back-rank characters.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Emit the clear edits in the handoff plan.
- [ ] **Step 4:** Run — passes; `npm test`.
- [ ] **Step 5:** Commit: `feat(battle): clear exhaustion at the start of a side's turn`.

### Task 2.4: Basic Automation v2 — Ending banish + Fatigue

**Files:** Modify `src/battle/automation/basic-automation.ts`; `debug/commands.ts` (`ERODE` edit-kind contract, pulled forward from Phase 4). Tests: `basic-automation.test.ts`.

Two deterministic rules:
- **Ending banish** (rules §Turn Structure — Ending): on handoff, after the hand-limit discard, any of the outgoing side's cards with `status.ephemeral` still in hand, and any with `status.offering` still in play, are moved to `banished`.
- **Fatigue** (rules §Fatigue): drawing or eroding from an empty deck awards the opponent the doubling sequence 1⍟, 2⍟, 4⍟… A side tracks its fatigue counter; expose it as state (e.g. `BattleSideMutableState.fatigueCount`, default 0) so the doubling is reproducible across the snapshot/undo model.

```ts
// new BattleDebugEdit member (also used by the Phase 4 rail):
| { kind: "ERODE"; side: BattleSide; count: number }
// add to BattleSideMutableState:
fatigueCount: number;   // number of fatigue events suffered this battle; default 0
```

- [ ] **Step 1 (banish):** Failing test — an `ephemeral` hand card and an `offering` in-play card of the outgoing side are in `banished` after the handoff; a normal card is not. Bug class: end-of-turn statuses not enforced (cards lingering that the rules banish).
- [ ] **Step 2:** Run — fails; implement the banish edits in the handoff plan; pass.
- [ ] **Step 3 (fatigue):** Failing test — `DRAW_CARD` (and `ERODE`) against an empty deck awards the *opponent* `2^(fatigueCount)` points and increments `fatigueCount`; two empty-deck draws award 1 then 2. Bug class: wrong doubling, wrong side, or non-reproducible counter under undo.
- [ ] **Step 4:** Run — fails; implement in `apply-debug-edit.ts` for `DRAW_CARD`/`ERODE` (the empty-deck branch) reading/writing `fatigueCount`; pass.
- [ ] **Step 5:** `npm run typecheck && npm test`.
- [ ] **Step 6:** Commit: `feat(battle): automate end-of-turn banish and Fatigue`.

### Task 2.5: Basic Automation v2 — bookend phase auto-advance

**Files:** Modify `src/battle/automation/basic-automation.ts` and/or `components/PlayableBattleScreen.tsx` phase controls. Test: `basic-automation.test.ts` and/or `PlayableBattleScreen.test.tsx`.

The bookend phases (`dreamwell`, `draw`, `dawn`, `ending`) carry no player action; advancing into one immediately advances out of it (Dreamwell folds in the energy ramp from Task 2.1; Draw folds in the draw; Dawn folds in the exhaust-clear from Task 2.3; Ending folds in the banish/hand-limit from Task 2.4). Model this as: when automation receives a `SET_PHASE` to a bookend, it appends the bookend's effect edits and a follow-on `SET_PHASE` to the next surfaced phase.

- [ ] **Step 1:** Failing test — a `SET_PHASE → dreamwell` gesture under automation expands into (ramp edits) + `SET_PHASE → draw` … or, if you collapse bookends into the handoff, assert the handoff lands the active side in `day` with energy ramped and a card drawn. Bug class: a bookend phase that strands the turn (no auto-advance), or double-applying a bookend effect. Keep ONE test that pins "after a handoff the incoming side is in `day`, ramped, with a fresh draw, exhaustion cleared" — the integration invariant — rather than one test per bookend.
- [ ] **Step 2:** Run — fails; implement; pass.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4:** Commit: `feat(battle): auto-advance Dreamwell/Draw/Dawn/Ending bookend phases`.

**Phase 2 exit gate:** lint + typecheck + test green.

---

## Phase 3 — Unified Challenge resolver

### Task 3.1: Author `engine/challenge.ts`

**Files:** Create `src/battle/engine/challenge.ts`; reference `state/figments.ts`. Test: `src/battle/engine/challenge.test.ts`.

One resolver, evolving the keyword-aware logic currently in `basic-automation.ts:resolveChallenge`, made figment-correct over the discrete model and support-map aware:

```ts
export interface ChallengeInput {
  state: BattleMutableState;
  activeSide: BattleSide;
  supportContribution?: ReadonlyMap<string, number>; // caller-supplied; empty for the human path
}
export interface ChallengeResolution {
  lanes: readonly BattleLaneJudgment[];
  edits: BattleDebugEdit[];                 // ADJUST_SCORE + MOVE_CARD_TO_ZONE(void)/figment dissolves
  dissolved: readonly { battleCardId: string; side: BattleSide }[];
  playerScoreDelta: number;
  enemyScoreDelta: number;
}
export function resolveChallenge(input: ChallengeInput): ChallengeResolution;
```

Behavior (rules §Challengers/Defenders/Scoring + §Figments): per front-rank lane `F0..F3`, effective spark = `selectEffectiveSparkForInstance(i)` + `supportContribution.get(id) ?? 0`; unpaired challenger scores its spark; defended pairing dissolves the lower (ties both), with Vengeful dragging the winner down; figment stacks resolve top-down via `selectFigmentChallengeLossCount` and dissolve partially (decrement) or fully. Combat keywords come from: `status.granted*` flags first, then the narrow printed-text scan, then figment-type (catalog). Keep `FIGMENT_KEYWORDS`/`KEYWORD_PATTERNS` logic — relocate it here.

- [ ] **Step 1:** Write failing tests by bug class (port + extend the cases that `basic-automation.test.ts` already covers, now against `challenge.ts`):
  - unpaired challenger scores spark; empty/defender-only lanes score nothing;
  - lower spark dissolves; equal spark dissolves both;
  - Vengeful loser drags the opponent down;
  - figment stack partial loss (decrement, instance stays) vs full loss (to void);
  - `supportContribution` raises a character over its defender and flips the outcome.
- [ ] **Step 2:** Run — fails (module absent).
- [ ] **Step 3:** Implement `resolveChallenge`.
- [ ] **Step 4:** Run — passes; `npm run typecheck`.
- [ ] **Step 5:** Commit: `feat(battle): add the unified Challenge resolver`.

### Task 3.2: Route Basic Automation and judgment.ts through the resolver

**Files:** Modify `src/battle/automation/basic-automation.ts` (delete its private `resolveChallenge`/`dissolvesAgainst`/`hasKeyword`, call `engine/challenge.ts`), `src/battle/engine/judgment.ts` (re-export/delegate to `challenge.ts`). Tests: existing `basic-automation.test.ts` and `judgment.test.ts` are the safety net.

- [ ] **Step 1:** Replace `basic-automation`'s inline challenge with a call to `engine/challenge.resolveChallenge` (pass an empty support map). Run `basic-automation.test.ts` — expect green (behavior preserved); fix any delta.
- [ ] **Step 2:** Make `judgment.ts:resolveJudgment` delegate to `challenge.ts` (adapt its `JudgmentProposal` shape from the `ChallengeResolution`), keeping its existing signature so the AI compiles. It is now keyword-aware (previously keyword-blind — that was the divergence). Run `judgment.test.ts`; update assertions that encoded the old keyword-blind behavior, noting the bug they masked.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4:** Commit: `refactor(battle): converge both challenge paths on the unified resolver`.

**Deferred (flagged):** challenger/defender designation snapshotting (spec §4.3). The resolver reads live front-rank positions; add a `// TODO(designations)` note in `challenge.ts` referencing spec §4.3 so the deferral is discoverable.

**Phase 3 exit gate:** lint + typecheck + test green.

---

## Phase 4 — Debug rail

The rail is the player's surface for every CHOICE/MANUAL mechanic in the coverage checklist. Most tasks add a `BattleDebugEdit` kind + its `apply-debug-edit` handler + a button wired through `battle-ui-commands.ts` into the Inspector/context menu. Browser QA at the end.

### Task 4.1: Status edits (`SET_CARD_STATUS`) + ☾ auto-retreat

**Files:** Modify `state/apply-debug-edit.ts` (extend the `SET_CARD_STATUS` handler from Task 2.3), components for the toggles. Test: `apply-debug-edit.test.ts`.

`SET_CARD_STATUS` already exists (Task 2.3, merges a `Partial<BattleCardStatus>`). Extend its handler with the ☾ auto-retreat rule: when a change sets `isExhausted: true` on a front-rank character, auto-retreat it to an open back-rank slot (rules §Exhaust and Awaken); if none is open, reject the exhaust (return state unchanged). Then add the card-scoped toggle UI (exhaust/awaken, reclaim/offering/ephemeral, veil N, granted keywords) via the existing dispatch path.

- [ ] **Step 1:** Failing tests: `SET_CARD_STATUS` merges partials (toggling `reclaimed` leaves `counters` intact); exhausting a front-rank character moves it to a back-rank slot; exhausting with the back rank full and no front-rank swap target is rejected. Bug class: a front-rank character paying ☾ but staying a challenger; partial-merge clobbering other status fields.
- [ ] **Step 2:** Run — fails; implement; pass.
- [ ] **Step 3:** Wire toggle buttons (exhaust/awaken, reclaim/offering/ephemeral, veil N, granted keywords) into the card-scoped Inspector surface, reusing the existing command-dispatch path (`withDefaultSourceSurface`, `sourceSurface: "inspector"`).
- [ ] **Step 4:** `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `feat(battle): card status debug tools with ☾ auto-retreat`.

### Task 4.2: Counters tool (`SET_COUNTERS`)

**Files:** `debug/commands.ts`, `state/apply-debug-edit.ts`, the card-scoped rail. Test: `apply-debug-edit.test.ts`.

```ts
| { kind: "SET_COUNTERS"; battleCardId: string; value: number }
```

Sets `status.counters` (clamped ≥ 0). Counters reset to 0 when a card leaves play — ensure the existing leave-play path (the code that clears `enteredPlayTurnNumber`) also zeroes `status.counters`.

- [ ] **Step 1:** Failing tests: sets/clamps counters; leaving play zeroes counters. Bug class: counters surviving a zone change (rules §Counters say they reset).
- [ ] **Step 2–4:** Implement, wire a stepper button, `npm test`.
- [ ] **Step 5:** Commit: `feat(battle): ⧗ counter debug tool`.

### Task 4.3: Erode tool

**Files:** `state/apply-debug-edit.ts` (`ERODE` handler from Task 2.4's contract), the side-scoped rail (`BattleStatusStrip`/`BattleSideSummaryPopover`). Test: `apply-debug-edit.test.ts`.

`ERODE { side, count }`: move the top `count` cards of `side`'s deck to its void; an empty deck triggers Fatigue (Task 2.4).

- [ ] **Step 1:** Failing test: erode moves N from deck top to void in order; eroding past the deck triggers Fatigue for the remaining count. Bug class: erode taking from the wrong end, or not chaining into Fatigue.
- [ ] **Step 2–4:** Implement, wire an "Erode N" button, `npm test`.
- [ ] **Step 5:** Commit: `feat(battle): Erode debug tool`.

### Task 4.4: Figment creator over the 14-type catalog

**Files:** Modify `components/BattleFigmentCreator.tsx`; `debug/commands.ts` `CREATE_FIGMENT` (allow catalog-default spark). Tests: `BattleFigmentCreator.test.tsx`.

Replace free-typed subtype/spark with a picker over the 14 catalog types; selecting a type pre-fills base spark and shows its keyword; spark stays editable for off-base figments.

- [ ] **Step 1:** Failing test: the creator lists 14 types; choosing "Wraith" pre-fills spark 0 and surfaces Vengeful; confirming dispatches `CREATE_FIGMENT` with the chosen subtype/spark. Bug class: a type missing from the picker, or the keyword not stamped. (One render+interaction test over the catalog, not 14 tests.)
- [ ] **Step 2–4:** Implement, `npm test`.
- [ ] **Step 5:** Commit: `feat(battle): figment creator backed by the 14-type catalog`.

### Task 4.5: Abandon / Rematerialize / Dreamwell-draw rail actions

**Files:** `debug/commands.ts`, `state/apply-debug-edit.ts`, the rail. Tests: `apply-debug-edit.test.ts`.

- **Abandon** = move a chosen own character to void (already expressible via `MOVE_CARD_TO_ZONE`); add a labeled rail button so the gesture is first-class and reads as "Abandon" in the log. (▸Dissolved effects are player-resolved.)
- **Rematerialize** = a labeled button that the player uses to re-run a character's ▸Materialized resolution manually (no engine effect; logs the intent). Model as a no-op `MOVE`/note, or a thin `REMATERIALIZE { battleCardId }` edit that only emits a log event.
- **Dreamwell-draw** = a side-scoped button that runs the energy ramp + draw step on demand (reuses Task 2.1 edits) for sandbox setup.
- **Already expressible (verify + relabel, no new edit kind):** dissolve (`MOVE_CARD_TO_ZONE → void`), return-to-hand (`→ hand`), banish (`→ banished`), and gain-control (the existing controller reassignment when a card crosses sides — confirm a cross-side move flips `controller`). Confirm each is reachable from the rail under a current-rules label. The Foresee overlay already looks/reorders the deck top; **add a send-to-void affordance** to it if missing (rules §Foresee). Discover stays a manual pick (reveal deck top → move a chosen card to hand).

- [ ] **Step 1:** Failing tests only where there is real behavior: Abandon routes a figment stack's **top** member to void (rules §Abandon targets the topmost figment); Dreamwell-draw raises max ● and draws. Skip a behavior test for Rematerialize (log-only) — assert the log event instead if cheap. Bug class: abandoning the wrong figment member.
- [ ] **Step 2–4:** Implement; wire buttons; verify dissolve / return-to-hand / banish / gain-control are rail-reachable with current labels, and add the Foresee→void affordance if missing; `npm test`.
- [ ] **Step 5:** Commit: `feat(battle): Abandon / Rematerialize / Dreamwell-draw rail actions`.

### Task 4.6: Relabel the rail to current rules + remove stale buttons

**Files:** `components/{BattleInspector,BattleActionBar,BattleStatusStrip,BattleSideSummaryPopover,BattlefieldGrid,BattleContextMenu}.tsx`, `ui/format.ts`. Tests: the component/screen tests that assert button labels.

Relabel "Reserve"/"Deployed" → "Back Rank"/"Front Rank" and "Judgment" → "Challenge" wherever surfaced; remove any debug buttons tied to removed concepts; ensure the new tools (status, counters, erode, figment catalog, abandon) are reachable.

- [ ] **Step 1:** Update labels; run the component/screen tests; fix assertions that pinned old labels.
- [ ] **Step 2:** `npm run typecheck && npm test`.
- [ ] **Step 3:** Commit: `refactor(battle): relabel debug rail to current rules terminology`.

### Task 4.7: Browser QA of the rail

**Files:** none (manual QA per the `journey-battle` skill and the `reference_battle_browser_qa_setup` memory).

- [ ] **Step 1:** Start a QA Vite server on a non-5173 port (`npm run dev -- --port 5174`), capture its PID.
- [ ] **Step 2:** Enter a battle (copy `.env`, run setup-assets, click "Create Game" per the memory). Exercise each new rail tool; after each action take a screenshot and re-measure invariants (hand count, rank counts, energy, score). Inspect the error buffer (`agent-browser errors`) for render errors / unhandled rejections.
- [ ] **Step 3:** Tear down only the PID/port you started (never a bare `pkill -f vite`).
- [ ] **Step 4:** No commit (QA only); record findings; file follow-up tasks for any defects.

**Phase 4 exit gate:** lint + typecheck + test green + clean browser QA.

---

## Phase 5 — AI re-point

The AI tree is tightly coupled to the old model (slots, phases, `judgment.ts`, figment-free assumptions). Re-point it; keep the proposal/approval hook, beam search, and asymmetric-knowledge shape. Deck stays the Starter set (510–519).

### Task 5.1: Migrate AI to the new slots, zones, and phases

**Files:** `src/battle/ai/{forward-model,planner,evaluate,opponent-model,defense,support-contribution}.ts`, `ai/use-battle-ai.ts`, `ai/trace.ts`. Tests: the co-located `ai/*.test.ts`.

- [ ] **Step 1:** Replace `DEPLOY_SLOT_IDS`/`RESERVE_SLOT_IDS` usage and `D*/R*` literals with `FRONT_RANK_SLOT_IDS`/`BACK_RANK_SLOT_IDS` and `F*/B*`; rename `deployed`/`reserve` reads; update the `mutable.phase === "dusk"` / handoff phase checks to the new union. Lean on typecheck.
- [ ] **Step 2:** Run the AI test suite; fix fixtures pinning old ids/phases.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4:** Commit: `refactor(battle/ai): migrate AI to front/back rank and the 8-phase model`.

### Task 5.2: Point the AI at the unified resolver; remove the judgment shim

**Files:** `ai/use-battle-ai.ts`, `ai/opponent-model.ts`, `ai/evaluate.ts`, delete `src/battle/engine/judgment.ts` and its test (or fold the test into `challenge.test.ts`). Tests: AI suite.

- [ ] **Step 1:** Replace `resolveJudgment` calls with `engine/challenge.resolveChallenge`, adapting result shapes; have `opponent-model.ts`/`evaluate.ts` stop re-deriving lane math and reuse the resolver where practical.
- [ ] **Step 2:** Remove `judgment.ts` (the shim) once no importer remains. `npm run typecheck` confirms.
- [ ] **Step 3:** Run the AI suite; reconcile `evaluate.ts` expectations (it estimates next-Challenge points) against the now keyword-aware math.
- [ ] **Step 4:** `npm run typecheck && npm test`.
- [ ] **Step 5:** Commit: `refactor(battle/ai): resolve combat through the unified resolver; drop judgment.ts`.

### Task 5.3: Refresh the Starter per-card models

**Files:** `src/battle/ai/cards/*` and `ai/cards/card-numbers.ts`. Tests: the co-located `ai/cards/*.test.ts`.

The deck (numbers 510–519) is unchanged and exists in `cards.toml`; only the code constants/labels drifted (`SIGILSWORN_CHAMPION`, `DISTANT_WORLDS`, `MEADOWFORGED_COLOSSUS`, etc.). Rename constants/files to the current names (Runebound Champion, Worlds Await, Wildflower Colossus, …) and verify each model's modeled ability still matches the card's current `rendered-text`.

- [ ] **Step 1:** Cross-check each 510–519 card's current text in `cards.toml` against its model; fix any drifted behavior (e.g. Support value, ▸Dawn point, ▸Dissolved draw).
- [ ] **Step 2:** Rename stale constants/identifiers to current names; update tests.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4:** Commit: `refactor(battle/ai): refresh Starter card models to current names and text`.

### Task 5.4: Reconcile the exhaust proxy

**Files:** `ai/forward-model.ts` (`enteredPlayTurnNumber` → `status.isExhausted`), `state/apply-debug-edit.ts`, `types.ts`. Tests: AI + state suites.

- [ ] **Step 1:** Switch the AI's `canChallengeThisTurn` derivation to read `status.isExhausted`. Once nothing reads `enteredPlayTurnNumber` for exhaustion, decide whether to keep it (purely informational) or remove it; if removed, update `types.ts` and all writers.
- [ ] **Step 2:** `npm run typecheck && npm test`.
- [ ] **Step 3:** Commit: `refactor(battle): use the authoritative exhausted flag for combat eligibility`.

**Phase 5 exit gate:** lint + typecheck + test green.

---

## Phase 6 — Default-on & integration

### Task 6.1: Flip Basic Automation ON by default

**Files:** `src/battle/components/PlayableBattleScreen.tsx` (the `isBasicAutomationEnabled` state init), wiring `runtimeConfig.basicAutomation` in. Tests: `PlayableBattleScreen.test.tsx`.

Initialize the toggle from `runtimeConfig.basicAutomation` (default `true`) instead of the literal `useState(false)`; keep the gear toggle for manual override; `?automation=0` forces off.

- [ ] **Step 1:** Update the two tests at `PlayableBattleScreen.test.tsx` that assert the OFF default and click-to-enable (the gear now starts ON; the click toggles OFF). Re-run them — they should drive the change.
- [ ] **Step 2:** Make the init read the runtime flag; `npm test` the screen test.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4:** Commit: `feat(battle): default Basic Automation on`.

### Task 6.2: Validate the AI-on + automation-on cross-product

**Files:** `src/battle/components/PlayableBattleScreen.tsx` (`isAiEnemyHandoff` guard at the AI-handoff shortcut). Test: a new focused case in `PlayableBattleScreen.test.tsx`.

With both systems on by default, the human-ended turn is automated while the AI self-resolves its own end-turn (bypassing `handleCommand`). The existing `isAiEnemyHandoff`-vs-`!isBasicAutomationEnabled` guard prevents a double energy ramp; confirm there is no double Challenge resolution or double draw at either boundary (player→enemy, enemy→player).

- [ ] **Step 1:** Failing/guarding test: simulate a full turn handoff with AI on and automation on; assert energy ramps once, the Challenge resolves once (scores/dissolves applied a single time), and exactly one card is drawn for the incoming side. Bug class: double-resolution at the AI/automation boundary — the untested cross-product.
- [ ] **Step 2:** Run — fix the guard if it fails; pass.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4:** Commit: `test(battle): pin single-resolution at the AI/automation handoff boundary`.

### Task 6.3: Full-flow browser QA

**Files:** none (manual QA).

- [ ] **Step 1:** QA server on a non-5173 port (capture PID). Play a full AI battle (default `?ai=1` + automation on): materialize characters, position front/back rank, create a figment stack, run a Challenge to scoring, erode, store/spend counters, reach a victory.
- [ ] **Step 2:** After each step, screenshot + re-measure invariants; inspect the error buffer. Confirm controls are usable, state changes are correct, layout is stable at the tested viewport.
- [ ] **Step 3:** Repeat the critical path with `?ai=0` (manual sandbox) and with `?automation=0` (pure manual) to confirm the escape hatches.
- [ ] **Step 4:** Tear down only your PID/port. Record findings; file follow-ups for defects.

### Task 6.4: Documentation

**Files:** `docs/journey_prototype/journey_prototype.md` (Battle Prototype Behavior section), `docs/journey_prototype/battle_ai.md` (stale `?ai=1` note + drifted card names), `docs/journey_prototype/url_parameters.md` (add `automation`).

Describe the **current** system (repo doc rule: no "no longer / removed" phrasing). Update the battle section to: structural automation default-on; front/back rank + Challenge terminology; the energy track; the rail tools; `?automation=0`.

- [ ] **Step 1:** Edit the three docs to current state.
- [ ] **Step 2:** Re-read for any "no longer"/"removed"/"unlike before" phrasing; rewrite directly.
- [ ] **Step 3:** Commit: `docs(battle): document the rewritten battle mode and automation flag`.

**Phase 6 exit gate:** lint + typecheck + test green + clean full-flow browser QA. The §5 / Appendix B coverage map is satisfied — every mechanic is AUTO, RAIL, or cleanly MANUAL.

---

## Final acceptance

- `npm run lint && npm run typecheck && npm test` green on the branch.
- A full `?ai=1` battle plays start-to-finish with automation on; `?ai=0` and `?automation=0` both work.
- Terminology is uniformly front/back rank + Challenge; no `reserve`/`deployed`/`judgment`/legacy-phase identifiers remain (grep clean).
- Discrete figment stacking matches the rules' worked examples; the 14-type catalog drives figment creation.
- Coverage checklist mechanics are each owned by structural automation, a rail tool, or a clean manual path; Phasing is documented in `battle_rules.md`.
- Two flagged deviations (Support-via-sparkDelta/support-map; deferred designation snapshotting) are acceptable or converted into follow-up tasks per reviewer call.
