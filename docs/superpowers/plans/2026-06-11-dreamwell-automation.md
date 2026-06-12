# Dreamwell Effect Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the battle UI's basic automation so a revealed Dreamwell card's bonus ability is resolved automatically — deterministically where possible, and via interactive prompts where the player must choose — for 29 of the 33 Dreamwell cards.

**Architecture:** A per-UUID *effect table* maps each Dreamwell card to an ordered list of *steps*. A UI-layer *runner* (a React hook plus a pure core) walks the steps: deterministic `edits` steps dispatch normal debug-edit commands immediately; `prompt` steps render a modal and pause until the player chooses, then dispatch that step's edits and advance. `BattleMutableState` is unchanged — every step is an ordinary, undoable command flowing through the existing reducer/history path.

**Tech Stack:** TypeScript, React (function components + hooks), Vitest. Existing battle modules: `BattleDebugEdit` command union, `planBasicAutomationCommands`, the multiplayer battle controller (`dispatch({ type: "APPLY_COMMAND", command })`), and the existing overlay conventions in `BattleForeseeOverlay`.

**Design doc:** `docs/superpowers/specs/2026-06-11-dreamwell-automation-design.md` — the per-card effect→edit mapping table there is the authoritative source for what each card does. This plan references it rather than re-listing all 29 builders.

---

## Background facts the implementer needs

- **Dispatch is synchronous but state reads are per-render.** `handleCommand` in `PlayableBattleScreen.tsx:234` runs `planBasicAutomationCommands` and dispatches the resulting commands in a loop. After a `dispatch`, the updated state arrives as a new `reducerState.mutable` on the next render — you cannot read it back synchronously. The runner therefore advances **one step per render**, reading the latest `reducerState.mutable` each time. React batches the edit dispatch and the step-advance state update together, so the next render's `reducerState.mutable` reflects the just-dispatched edits.
- **Draws append to the end of hand.** `DRAW_CARD` adds the drawn card at `hand[hand.length - 1]` (confirmed by the hand-limit discard in `basic-automation.ts:425`, which treats `hand[hand.length - 1]` as most-recently-acquired). Twin Moons' "if it is a character" step relies on this.
- **The Dreamwell reveal already fires.** `PlayableBattleScreen.tsx:294` dispatches `DRAW_DREAMWELL_CARD` once per `(activeSide, turnNumber)` on the Dreamwell phase, and `planDreamwellReveal` (`basic-automation.ts:210`) folds in the energy. After that commits, `state.sides[side].dreamwellCardIndex` points at the revealed card in `BattleInit.dreamwellDeck` and `dreamwellDrawnTurn === turnNumber`. The runner's start trigger keys off exactly these fields.
- **Bypass the planner for runner edits.** Runner-dispatched edits are already-concrete primitives. Dispatch them directly as `{ type: "APPLY_COMMAND", command: { id: "DEBUG_EDIT", edit, sourceSurface: "auto-system" } }` — do **not** route them back through `planBasicAutomationCommands` (that would re-expand plays/energy).
- **`BattleCommandSourceSurface` is a closed union** (`types.ts:59`). Reuse the existing `"auto-system"` surface for runner edits rather than adding a member; structured `battle_proto_dreamwell_*` log events provide the distinguishability instead.
- **Primitives available** (all in `BattleDebugEdit`, `debug/commands.ts:38`): `DRAW_CARD`, `DISCARD_CARD`, `ADJUST_CURRENT_ENERGY`, `ADJUST_SCORE`, `ADJUST_MAX_ENERGY`, `ERODE`, `MOVE_CARD_TO_ZONE` (zones: hand/void/banished/deck-top/deck-bottom/battlefield slot), `ABANDON`, `SET_CARD_SPARK_DELTA`, `SET_SIDE_HAND_VISIBILITY`, `CREATE_FIGMENT`, `REVEAL_DECK_TOP`, `REORDER_DECK`, `PLAY_FROM_DECK_TOP`. Useful selectors (`state/selectors.ts`): `selectBattleCardInstance`, `selectBattleCardLocation`, `selectDefaultCharacterPlaySlot`.

## File structure

| File | Responsibility |
| --- | --- |
| `src/battle/automation/dreamwell-effects.ts` (create) | Step/prompt/context **types** and pure **builder helpers** (draw, gain, zone filters). No table dependency. |
| `src/battle/automation/dreamwell-effects-table.ts` (create) | The per-UUID `DREAMWELL_EFFECTS` table, the `DREAMWELL_MANUAL_IDS` set, and `selectDreamwellEffectScript` / `dreamwellAutomationStatus`. Imports types+helpers. |
| `src/battle/automation/dreamwell-runner-core.ts` (create) | Pure runner core: `planNextDreamwellStep` and `applyPromptResolution`, plus the active-prompt / resolution types the UI renders. No React. |
| `src/battle/automation/use-dreamwell-effect-runner.ts` (create) | React hook: start trigger, step-advance effect, prompt state, edit dispatch, logging. Thin glue over the core. |
| `src/battle/components/BattleCardPickerOverlay.tsx` (create) | "Pick N cards from this candidate list" modal. |
| `src/battle/components/BattleChoicePromptOverlay.tsx` (create) | "Choose one of these labelled options" modal (also serves confirm as Yes/Skip). |
| `src/battle/components/BattleDreamwellDisplay.tsx` (modify) | Add an Auto/Manual badge. |
| `src/battle/components/PlayableBattleScreen.tsx` (modify) | Instantiate the runner, render the active overlay, supply `dispatchEdit`, pass the badge status. |
| `src/battle/automation/dreamwell-effects.test.ts` (create) | Tests for helpers, status partition, and table behavior. |
| `src/battle/automation/dreamwell-runner-core.test.ts` (create) | Tests for the pure runner core. |

## Known v1 limitations (document in code comments, do not silently mis-implement)

- **Silent Winter** ("banish an enemy until end of turn"): there is no temporary-banish primitive. v1 moves the enemy to `banished` and does **not** auto-return it at end of turn; the operator returns it manually. Note this in the table entry comment.
- A character put into play by a Dreamwell effect (Ruin Tree, Celestial Gateway) does **not** auto-resolve its own ▸Materialized ability — consistent with how `planCardPlay` already handles playing any card. No energy is charged (the Dreamwell grants the play).

---

### Task 1: Effect types and builder helpers

**Files:**
- Create: `src/battle/automation/dreamwell-effects.ts`
- Test: `src/battle/automation/dreamwell-effects.test.ts`

- [ ] **Step 1: Define the types**

These type definitions are the contract every later task depends on — embed them exactly:

```ts
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleSide } from "../types";

/** Live context passed to every builder. `state` is the committed state at the
 *  moment the step runs (post-previous-step). `random`/`nowMs` are injected so
 *  builders stay pure and testable (default to Math.random / Date.now at the
 *  call site). */
export interface StepContext {
  side: BattleSide;
  state: BattleMutableState;
  random: () => number;
  nowMs: number;
}

export type DreamwellPrompt =
  | {
      kind: "pick-cards";
      label: string;
      count: number;
      optional: boolean;
      candidates: (ctx: StepContext) => string[];
      resolve: (chosenIds: string[], ctx: StepContext) => BattleDebugEdit[];
    }
  | {
      kind: "choice";
      label: string;
      options: { label: string; build: (ctx: StepContext) => BattleDebugEdit[] }[];
    }
  | { kind: "confirm"; label: string; onYes: DreamwellEffectStep[] }
  | { kind: "foresee"; count: number };

export type DreamwellEffectStep =
  | { kind: "edits"; build: (ctx: StepContext) => BattleDebugEdit[] }
  | { kind: "prompt"; prompt: DreamwellPrompt };

export interface DreamwellEffectScript {
  id: string; // Dreamwell card UUID
  steps: DreamwellEffectStep[];
}
```

- [ ] **Step 2: Write the failing helper tests**

In the test file, cover the helpers by the bug class each catches. Construct a minimal `BattleMutableState` fixture (a `makeState` helper local to the test) with a couple of cards in each side's void/hand/ranks. Specify:
- `opponentOf("player") === "enemy"` and vice-versa (catches a swapped side in opponent-targeting cards).
- `charactersInVoid(state, side, maxCost)` returns only `battleCardKind === "character"` void ids whose `energyCost <= maxCost`, and excludes events and over-cost cards (catches wrong-zone / wrong-type / cost-filter bugs that would let Ruin Tree offer an event or an expensive card).
- `eventsInVoid` returns only events in that side's void.
- `enemyCharactersInPlay(state, side)` returns the opponent's front+back rank occupants only (catches self-targeting and hand/void leakage in Silent Winter).
- `drawUntilEdits(state, side, target)` returns exactly `max(0, target - hand.length)` `DRAW_CARD` edits (catches off-by-one and the already-at-target case producing spurious draws).
- `alliesInPlay(state, side)` returns the side's own front+back occupants.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/battle/automation/dreamwell-effects.test.ts`
Expected: FAIL (helpers not exported yet).

- [ ] **Step 4: Implement the helpers**

Add to `dreamwell-effects.ts` the pure helpers exercised above plus the trivial ones the table needs: `drawEdits(side, count)`, `gainEnergyEdits(side, amount)`, `gainScoreEdits(side, amount)`, `topOfDeck(state, side, n)`. Each is a few lines; derive ranks from `FRONT_RANK_SLOT_IDS`/`BACK_RANK_SLOT_IDS` and read `state.cardInstances[id].definition.battleCardKind` / `.energyCost`. Skip missing instances defensively (a located id with no instance returns nothing).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/battle/automation/dreamwell-effects.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/battle/automation/dreamwell-effects.ts src/battle/automation/dreamwell-effects.test.ts
git commit -m "feat(battle): dreamwell effect types and builder helpers"
```

---

### Task 2: Effect table — deterministic cards + status partition

**Files:**
- Create: `src/battle/automation/dreamwell-effects-table.ts`
- Test: `src/battle/automation/dreamwell-effects.test.ts` (extend)

Implement the 14 deterministic entries from the design doc's "Deterministic (no prompt)" table, plus the status classification. Use the UUIDs and effect descriptions in the spec verbatim as the source of truth.

- [ ] **Step 1: Write the failing status-partition + representative-builder tests**

Specify these, naming the bug class:
- **Partition invariant:** `DREAMWELL_EFFECTS` keys and `DREAMWELL_MANUAL_IDS` are disjoint; every key is a 36-character UUID string. Catches a card accidentally listed as both automated and manual, or a malformed id.
- **`dreamwellAutomationStatus` contract:** returns `"auto"` for a table id, `"manual"` for a `DREAMWELL_MANUAL_IDS` id (use the 4 excluded UUIDs from the spec), and `"none"` for an unknown id. Catches the badge logic mislabeling excluded cards.
- **Representative deterministic builders** (run the script's `edits` steps against a fixture and assert the produced edits). Pick one card per builder *shape*, not one per card:
  - Autumn Glade → a single `ADJUST_SCORE +2` for the active side (gain-score shape).
  - Twilight Radiance → `ADJUST_CURRENT_ENERGY +1` (gain-energy shape).
  - The Voltsurge → two `DRAW_CARD` for each side (each-player shape).
  - Wellspring Commons against a side already holding 3 cards → zero draws for that side (draw-until boundary).
  - The Brimming Well → `ADJUST_MAX_ENERGY +1` targeting the **opponent** (opponent-targeting shape; catches a side swap).
  - Eternal Horizon with two allies on board → one `SET_CARD_SPARK_DELTA` per ally with `value === existing sparkDelta + 1` (delta-not-absolute shape; catches using `SET_CARD_SPARK`).
- **Property test over all auto scripts:** for every script in `DREAMWELL_EFFECTS`, executing each `edits` step's `build(ctx)` against a richly-populated fixture throws no error and every produced edit's referenced `battleCardId` exists in `state.cardInstances` (or the edit is side/score/energy-scoped). Catches selector typos and stale ids across all entries with one test.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/battle/automation/dreamwell-effects.test.ts`
Expected: FAIL (table module missing).

- [ ] **Step 3: Implement the deterministic table + status API**

Create `dreamwell-effects-table.ts`:
- `export const DREAMWELL_MANUAL_IDS = new Set<string>([...])` — the 4 excluded UUIDs from the spec (Forest Trailhead, Sunlit Archive, Echo Cascade, Firmament Mirror).
- `export const DREAMWELL_EFFECTS: Record<string, DreamwellEffectScript>` — the 14 deterministic entries. Each entry's value is `{ id, steps: [...] }` keyed by the same UUID. Use the helpers from Task 1. Add a one-line comment above each entry quoting the spec's effect text.
- `export function selectDreamwellEffectScript(cardId: string): DreamwellEffectScript | null` — `DREAMWELL_EFFECTS[cardId] ?? null`.
- `export function dreamwellAutomationStatus(cardId: string): "auto" | "manual" | "none"`.

Three entries need a code-level note because the builder isn't obvious from "draw a card":

```ts
// Twin Moons — "Draw a card. If it is a character, gain 1●."
// Two steps so the second sees the post-draw hand. The drawn card is the last
// hand entry (DRAW_CARD appends to the end of hand).
steps: [
  { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
  { kind: "edits", build: (ctx) => {
      const hand = ctx.state.sides[ctx.side].hand;
      const drawnId = hand[hand.length - 1];
      const drawn = selectBattleCardInstance(ctx.state, drawnId ?? null);
      return drawn?.definition.battleCardKind === "character"
        ? gainEnergyEdits(ctx.side, 1)
        : [];
    } },
],
```

```ts
// Celestial Gateway — "Return a random character from each player's void to play."
// For each side independently: pick one random void character and move it to that
// side's default play slot. Skip a side with no void character or no open slot.
// ctx.random keeps the pick reproducible/testable; the resulting MOVE edits are
// logged per-step by the runner so the choice is reconstructable.
build: (ctx) => {
  const edits: BattleDebugEdit[] = [];
  for (const side of ["player", "enemy"] as const) {
    const voidChars = charactersInVoid(ctx.state, side);
    const slot = selectDefaultCharacterPlaySlot(ctx.state, side);
    if (voidChars.length === 0 || slot === null) continue;
    const pick = voidChars[Math.floor(ctx.random() * voidChars.length)];
    edits.push({ kind: "MOVE_CARD_TO_ZONE", battleCardId: pick, destination: slot });
  }
  return edits;
},
```

For **Foxfire Thicket** ("Materialize a 1✦ ethereal figment"), emit a single `CREATE_FIGMENT` with `chosenSpark: 1`, a destination from `selectDefaultCharacterPlaySlot(ctx.state, ctx.side)` (skip if null), and `createdAtMs: ctx.nowMs`. Read `BattleFigmentCreator.tsx` for the valid `chosenSubtype` string and `name` convention an ethereal figment uses, and match it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/battle/automation/dreamwell-effects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battle/automation/dreamwell-effects-table.ts src/battle/automation/dreamwell-effects.test.ts
git commit -m "feat(battle): deterministic dreamwell effect entries and Auto/Manual status"
```

---

### Task 3: Effect table — interactive-prompt cards

**Files:**
- Modify: `src/battle/automation/dreamwell-effects-table.ts`
- Test: `src/battle/automation/dreamwell-effects.test.ts` (extend)

Add the 15 single-prompt entries from the design doc's "Single prompt" table.

- [ ] **Step 1: Write the failing prompt tests**

Test prompts by calling `candidates(ctx)` and `resolve(chosenIds, ctx)` directly (no DOM). Choose representatives per prompt shape and name the bug class:
- **Leaf Light Canopy** (return from void): `candidates` = the side's void ids; `resolve(["v1"])` = one `MOVE_CARD_TO_ZONE` of `v1` to `{ side, zone: "hand" }`. Catches wrong destination zone.
- **Verdant Hollow** (return an *event* from void): `candidates` excludes void characters. Catches a missing type filter.
- **Silent Winter** (banish an enemy): `candidates` = opponent's in-play characters only; `resolve` moves the pick to `{ side: opponent, zone: "banished" }`. Catches self-targeting.
- **Astral Interface** (draw then discard): step 1 draws; step 2 prompt `candidates` = hand, `resolve(["h1"])` = `DISCARD_CARD h1`.
- **The Crossroads** (choice): `options[0].build` = one `DRAW_CARD`; `options[1].build` = `ADJUST_CURRENT_ENERGY +2`. Catches a swapped option mapping.
- **The Bastion** (confirm → abandon → draw 2): the prompt is `confirm` whose `onYes` is `[pick-cards(own characters, count 1, resolve = ABANDON), edits(draw 2)]`. Assert `onYes` is non-empty and its pick `resolve` emits an `ABANDON`. Catches a confirm that drops its payload.
- **Shining Beacon** (top 2 → 1 to hand, other to bottom): `candidates` = `topOfDeck(state, side, 2)`; `resolve(["top1"])` emits `MOVE top1 → hand` **and** `MOVE` the other candidate → `{ side, zone: "deck", position: "bottom" }`. Catches forgetting the "other to bottom" half.
- **Property test over all prompts:** walk every script; for each `pick-cards` prompt, `resolve(candidates(ctx).slice(0, count), ctx)` throws no error and produces only edits referencing existing cards; for each `choice`, every option's `build(ctx)` throws no error. Confirm prompts recurse into `onYes`. Catches broken resolvers across all entries at once.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/battle/automation/dreamwell-effects.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the prompt entries**

Add the 15 entries per the spec mapping. Most are mechanical (`pick-cards` with a candidate filter + a `resolve` emitting one move/discard). Two need notes:

```ts
// Ruin Tree — "You may immediately play a ≤2● cost character from your void."
// confirm → pick one ≤2● void character → move it to a battlefield slot. No
// energy is charged (the Dreamwell grants the play) and the played card's own
// ability is left for the operator, matching planCardPlay.
prompt: { kind: "confirm", label: "Play a character from your void?", onYes: [
  { kind: "prompt", prompt: {
      kind: "pick-cards", label: "Choose a character to play", count: 1, optional: false,
      candidates: (ctx) => charactersInVoid(ctx.state, ctx.side, 2),
      resolve: ([id], ctx) => {
        const slot = selectDefaultCharacterPlaySlot(ctx.state, ctx.side);
        return id && slot ? [{ kind: "MOVE_CARD_TO_ZONE", battleCardId: id, destination: slot }] : [];
      },
  } },
] },
```

```ts
// Silent Winter — "Banish an enemy until end of turn."
// v1 limitation: no temporary-banish primitive; the card is moved to `banished`
// permanently and the operator returns it manually at end of turn.
```

For **Sunset's Last Gaze** and **Fortune's Wheel** (both "you may … then draw"), model as `confirm` with `onYes` = the discard pick(s) + draw `edits`. Fortune's Wheel computes `n = hand.length` once, then emits `n` `DISCARD_CARD` + `n` `DRAW_CARD` in one `edits` step.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/battle/automation/dreamwell-effects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/battle/automation/dreamwell-effects-table.ts src/battle/automation/dreamwell-effects.test.ts
git commit -m "feat(battle): interactive-prompt dreamwell effect entries"
```

---

### Task 4: Runner core (pure step machine)

**Files:**
- Create: `src/battle/automation/dreamwell-runner-core.ts`
- Test: `src/battle/automation/dreamwell-runner-core.test.ts`

This isolates the tricky control flow (queue advance, confirm-yes prepend, prompt pause) from React so it can be unit-tested.

- [ ] **Step 1: Define the core contract**

```ts
import type { BattleDebugEdit } from "../debug/commands";
import type { DreamwellEffectStep, DreamwellPrompt, StepContext } from "./dreamwell-effects";

/** What the UI must render when the runner is paused on a prompt. Candidate ids
 *  are resolved here (from live state) so the overlay needs no builder access. */
export type DreamwellActivePrompt =
  | { kind: "pick-cards"; label: string; candidateIds: string[]; count: number; optional: boolean }
  | { kind: "choice"; label: string; options: { label: string }[] }
  | { kind: "foresee"; count: number };

export type DreamwellPromptResolution =
  | { kind: "pick-cards"; chosenIds: string[] }
  | { kind: "choice"; optionIndex: number }
  | { kind: "foresee" };

/** Result of inspecting the head of the step queue. */
export type DreamwellStepPlan =
  | { type: "dispatch"; edits: BattleDebugEdit[]; rest: DreamwellEffectStep[] }
  | { type: "prompt"; active: DreamwellActivePrompt; prompt: DreamwellPrompt; rest: DreamwellEffectStep[] }
  | { type: "done" };

export function planNextDreamwellStep(
  remaining: DreamwellEffectStep[],
  ctx: StepContext,
): DreamwellStepPlan;

/** Given the paused prompt, the user's resolution, and the queued rest, returns
 *  the edits to dispatch and the next queue (confirm-yes prepends onYes). */
export function applyPromptResolution(
  prompt: DreamwellPrompt,
  resolution: DreamwellPromptResolution,
  rest: DreamwellEffectStep[],
  ctx: StepContext,
): { edits: BattleDebugEdit[]; rest: DreamwellEffectStep[] };
```

- [ ] **Step 2: Write the failing tests**

Name the bug class for each:
- `planNextDreamwellStep([], ctx)` → `{ type: "done" }` (empty queue terminates).
- Head is an `edits` step → `{ type: "dispatch", edits, rest }` where `rest` is the tail and `edits === build(ctx)`. Catches dropping the tail or not calling the builder.
- Head is a `pick-cards` prompt → `{ type: "prompt" }` with `active.candidateIds === prompt.candidates(ctx)` and `active.count`/`optional` mirrored. Catches forgetting to resolve candidates from live state.
- `applyPromptResolution` for `pick-cards` → edits === `prompt.resolve(chosenIds, ctx)`, `rest` unchanged. For `choice` → edits === `options[optionIndex].build(ctx)`. Catches off-by-one option indexing.
- `applyPromptResolution` for a **confirm** prompt with `optionIndex 0` (Yes) → `rest === [...prompt.onYes, ...originalRest]` and no edits; `optionIndex 1` (Skip) → `rest === originalRest`, no edits. This is the critical test: catches confirm-yes dropping either the `onYes` steps or the remaining queue.
- A `foresee` resolution → no edits, `rest` unchanged (the foresee overlay applies its own edits; the core just advances).

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/battle/automation/dreamwell-runner-core.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the core**

`planNextDreamwellStep`: if `remaining` empty → done; destructure `[head, ...rest]`; `edits` → dispatch; `prompt` → build the `DreamwellActivePrompt` (for `confirm`, present as a `choice` with options `[{label: "Yes"}, {label: "Skip"}]`; for `pick-cards`, call `candidates(ctx)`; for `foresee`, pass `count`). `applyPromptResolution`: switch on `prompt.kind`; for `confirm`, map `optionIndex 0` → prepend `onYes`, else passthrough.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/battle/automation/dreamwell-runner-core.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/battle/automation/dreamwell-runner-core.ts src/battle/automation/dreamwell-runner-core.test.ts
git commit -m "feat(battle): pure dreamwell runner core (step queue + prompt resolution)"
```

---

### Task 5: Prompt overlay components

**Files:**
- Create: `src/battle/components/BattleCardPickerOverlay.tsx`
- Create: `src/battle/components/BattleChoicePromptOverlay.tsx`

Model both on `BattleForeseeOverlay`'s structure: a `fixed inset-0 z-[60]` scrim with `role="dialog" aria-modal="true"`, a window-level capture-phase Escape listener (Escape = Skip when optional, otherwise ignored for a required pick), and the `createButtonClassName` button style. Render cards with `CardDisplay` + `battleCardDisplayFromInstance` (from `./BattleCardView`), as Foresee does.

**`BattleCardPickerOverlay` props:** `{ title: string; candidateIds: readonly string[]; count: number; optional: boolean; state: BattleMutableState; onConfirm: (chosenIds: string[]) => void; onSkip: () => void }`.

**`BattleChoicePromptOverlay` props:** `{ title: string; options: readonly { label: string }[]; onChoose: (index: number) => void }`.

- [ ] **Step 1: Extract and test the one piece of real logic**

The only non-trivial logic in the picker is selection toggling with a cap. Extract it as a pure exported helper in `BattleCardPickerOverlay.tsx`:

```ts
export function togglePick(selected: readonly string[], id: string, count: number): string[];
```

Write tests (in `src/battle/automation/dreamwell-effects.test.ts` or a sibling `BattleCardPickerOverlay.test.ts` — match the repo's component-test convention; if none, put it beside the other automation tests): selecting an unselected id when `selected.length < count` adds it; clicking a selected id removes it; selecting when already at `count` leaves `selected` unchanged (for `count === 1`, selecting a different id replaces the current pick). Catches the picker letting the user over-select or failing to deselect.

- [ ] **Step 2: Run to verify failure, implement, run to verify pass**

Run: `npx vitest run` on the chosen test file. Implement `togglePick`, then build both overlays around it.

Picker rendering requirements: a card grid over `candidateIds` (resolve each via `state.cardInstances[id]`, skip missing); clicking a card calls `togglePick`; a Confirm button enabled only when `selected.length === count`, calling `onConfirm(selected)`; a Skip button rendered only when `optional`, calling `onSkip`. Empty `candidateIds`: render "No valid targets" with a single dismiss button calling `onSkip` (optional) or `onConfirm([])` (required — a no-op resolution). Add QA hooks: `data-battle-dreamwell-picker`, `data-battle-dreamwell-pick-card={id}`, `data-battle-dreamwell-action="confirm|skip"`.

Choice rendering: one button per option calling `onChoose(index)`; `data-battle-dreamwell-choice`, `data-battle-dreamwell-option={index}`.

- [ ] **Step 3: Commit**

```bash
git add src/battle/components/BattleCardPickerOverlay.tsx src/battle/components/BattleChoicePromptOverlay.tsx src/battle/automation/dreamwell-effects.test.ts
git commit -m "feat(battle): dreamwell card-picker and choice prompt overlays"
```

---

### Task 6: Runner hook

**Files:**
- Create: `src/battle/automation/use-dreamwell-effect-runner.ts`

The hook turns the pure core into a live, self-pacing state machine. It owns three pieces of React state plus refs; this is the most race-sensitive code, so the structure below is prescriptive.

- [ ] **Step 1: Define the hook signature**

```ts
export interface DreamwellRunnerArgs {
  enabled: boolean;                        // isBasicAutomationEnabled
  state: BattleMutableState;               // reducerState.mutable (live, per-render)
  dreamwellDeck: readonly DreamwellCardDefinition[];
  dispatchEdit: (edit: BattleDebugEdit) => void; // bypasses planBasicAutomationCommands
}
export interface DreamwellRunnerResult {
  activePrompt: DreamwellActivePrompt | null;
  activePromptSide: BattleSide | null;     // for the foresee overlay + card rendering
  resolvePrompt: (resolution: DreamwellPromptResolution) => void;
}
export function useDreamwellEffectRunner(args: DreamwellRunnerArgs): DreamwellRunnerResult;
```

- [ ] **Step 2: Implement the state machine**

Internal state:
- `run: { cardId: string; side: BattleSide; remaining: DreamwellEffectStep[] } | null`
- `activePrompt: DreamwellActivePrompt | null`, and the paused `DreamwellPrompt` + its `rest` held in a ref (`pausedRef`) so `resolvePrompt` can call `applyPromptResolution`.
- `lastRunKeyRef` (string|null), `processedQueueRef` (`DreamwellEffectStep[] | null`).

Build `ctx` each render: `{ side: run.side, state: args.state, random: Math.random, nowMs: Date.now() }`.

**Start effect** (deps: `enabled`, relevant `state` fields, `dreamwellDeck`):
- Bail if `!enabled`, `state.result !== null`, `state.phase !== "dreamwell"`, or `state.turnNumber <= 1`.
- `side = state.activeSide`; bail unless `state.sides[side].dreamwellDrawnTurn === state.turnNumber` (the reveal for this turn has committed).
- `key = \`${side}:${state.turnNumber}\``; bail if `lastRunKeyRef.current === key`; set it.
- `index = state.sides[side].dreamwellCardIndex`; `cardId = dreamwellDeck[index]?.id`. Look up `selectDreamwellEffectScript(cardId)`; if non-null and has steps, `setRun({ cardId, side, remaining: [...script.steps] })` and emit the `battle_proto_dreamwell_effect_started` log (Task 8). Otherwise do nothing (deterministic-only "none"/"manual" cards still got their energy from the existing reveal path).

**Advance effect** (deps: `run`, `activePrompt`, `args.state`):
- Bail if `run === null` or `activePrompt !== null`.
- If `!enabled` or `args.state.result !== null` → clear run/prompt and return (abort on toggle-off or battle end).
- Guard: `if (processedQueueRef.current === run.remaining) return;` then `processedQueueRef.current = run.remaining;` — this dedupes re-renders that change `state` without advancing the queue, preventing double dispatch.
- `plan = planNextDreamwellStep(run.remaining, ctx)`:
  - `done` → emit `battle_proto_dreamwell_effect_resolved` log, `setRun(null)`.
  - `dispatch` → log `battle_proto_dreamwell_step` (Task 8), dispatch each edit via `args.dispatchEdit`, then `setRun({ ...run, remaining: plan.rest })` (new array → effect re-runs and proceeds).
  - `prompt` → store `{ prompt: plan.prompt, rest: plan.rest }` in `pausedRef`, `setActivePrompt(plan.active)`. Do not advance.

**`resolvePrompt(resolution)`:**
- Read `pausedRef.current`; `{ edits, rest } = applyPromptResolution(prompt, resolution, rest, ctx)`.
- Emit `battle_proto_dreamwell_prompt_resolved` log (Task 8) with the candidate/choice detail.
- Dispatch each edit via `args.dispatchEdit`; `setActivePrompt(null)`; `setRun({ ...run, remaining: rest })`.

Return `{ activePrompt, activePromptSide: run?.side ?? null, resolvePrompt }`.

> No automated test for the hook itself — its logic is the pure core (Task 4, tested) plus React glue. It is verified in the Task 8 browser QA pass.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/battle/automation/use-dreamwell-effect-runner.ts
git commit -m "feat(battle): dreamwell effect runner hook (start trigger + step pacing)"
```

---

### Task 7: Wire into the battle screen + Auto/Manual badge

**Files:**
- Modify: `src/battle/components/PlayableBattleScreen.tsx`
- Modify: `src/battle/components/BattleDreamwellDisplay.tsx`

- [ ] **Step 1: Add the badge to `BattleDreamwellDisplay`**

Add a prop `automationStatus: "auto" | "manual" | "none"`. When the card is visible and the status is `"auto"` or `"manual"`, render a small badge in a corner of the card container (`"Auto"` / `"Manual"`); render nothing for `"none"`. Keep it inside the `pointer-events: auto` card wrapper so it sits with the card. Add `data-battle-dreamwell-automation={automationStatus}` for QA.

- [ ] **Step 2: Add `dispatchEdit` and instantiate the runner in `PlayableBattleScreen`**

After `handleCommand` (around `PlayableBattleScreen.tsx:260`), add a planner-bypassing dispatcher:

```ts
const dispatchAutomationEdit = useCallback((edit: BattleDebugEdit): void => {
  dispatch({
    type: "APPLY_COMMAND",
    command: { id: "DEBUG_EDIT", edit, sourceSurface: "auto-system" },
  });
}, [dispatch]);
```

Then instantiate the runner:

```ts
const dreamwellRunner = useDreamwellEffectRunner({
  enabled: isBasicAutomationEnabled,
  state: reducerState.mutable,
  dreamwellDeck: battleInit.dreamwellDeck,
  dispatchEdit: dispatchAutomationEdit,
});
```

Import `BattleDebugEdit` (already imported as a type), `useDreamwellEffectRunner`, `dreamwellAutomationStatus`, and the two overlay components.

- [ ] **Step 3: Render the active prompt overlay**

Where the other overlays render (near `BattleForeseeOverlay`), add a switch on `dreamwellRunner.activePrompt?.kind`:
- `"pick-cards"` → `BattleCardPickerOverlay` with `title={activePrompt.label}`, `candidateIds`, `count`, `optional`, `state={reducerState.mutable}`, `onConfirm={(ids) => dreamwellRunner.resolvePrompt({ kind: "pick-cards", chosenIds: ids })}`, `onSkip={() => dreamwellRunner.resolvePrompt({ kind: "pick-cards", chosenIds: [] })}`.
- `"choice"` → `BattleChoicePromptOverlay` with `onChoose={(i) => dreamwellRunner.resolvePrompt({ kind: "choice", optionIndex: i })}`.
- `"foresee"` → reuse `BattleForeseeOverlay` with `initialCount={activePrompt.count}`, `side={dreamwellRunner.activePromptSide ?? activeSide}`, `state={reducerState.mutable}`, `onDispatch={dispatchAutomationEdit-wrapped-as-command}` (the foresee overlay calls `onDispatch` with full `BattleCommand`s — pass `(command) => dispatch({ type: "APPLY_COMMAND", command })`), and `onClose={() => dreamwellRunner.resolvePrompt({ kind: "foresee" })}`.

- [ ] **Step 4: Pass the badge status to the display**

At the `BattleDreamwellDisplay` render site, pass `automationStatus={dreamwellDisplayCard ? dreamwellAutomationStatus(dreamwellDisplayCard.id) : "none"}`.

- [ ] **Step 5: Verify build**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/battle/components/PlayableBattleScreen.tsx src/battle/components/BattleDreamwellDisplay.tsx
git commit -m "feat(battle): wire dreamwell effect runner and Auto/Manual badge into battle screen"
```

---

### Task 8: Logging + browser QA

**Files:**
- Modify: `src/battle/automation/use-dreamwell-effect-runner.ts` (the log calls referenced in Task 6)

- [ ] **Step 1: Emit the structured log events**

In the hook, using `logEvent` + `createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null })` (both from `../../logging`), emit:
- `battle_proto_dreamwell_effect_started` on run start: `dreamwellCardId`, `dreamwellCardName`, `side`, `stepCount`.
- `battle_proto_dreamwell_step` on each `edits` dispatch: `dreamwellCardId`, `editKinds` (the edits' `kind`s), and the primary target ids (`battleCardId`/`side` per edit) — this is what makes Celestial Gateway's random picks reconstructable.
- `battle_proto_dreamwell_prompt_resolved` on each prompt resolution: `dreamwellCardId`, `promptKind`, `label`, `candidateIds`, and the choice (`chosenIds` for pick-cards, `optionIndex` for choice/confirm, `kind: "foresee"` marker for foresee), plus `resultingEditKinds`.
- `battle_proto_dreamwell_effect_resolved` on completion: `dreamwellCardId`, `side`.

Goal restated from the spec: a production game's Dreamwell automation is reconstructable from the log — which card ran, what was offered, what was chosen, what changed.

- [ ] **Step 2: Full check suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Browser QA**

Per AGENTS.md, start a QA Vite server on a non-5173 port (`npm run dev -- --port 5174`), capture its PID, and drive a battle with `/opt/homebrew/bin/agent-browser`. Reach a Dreamwell phase past turn 1 with automation on and verify across several reveals:
- A deterministic card (e.g. Autumn Glade) applies its effect with no prompt and shows the **Auto** badge.
- A pick card (e.g. Leaf Light Canopy) opens the picker, a selection returns the chosen card to hand, and the overlay closes.
- A choice card (The Crossroads) opens the choice overlay and each option applies the right effect.
- A confirm card (The Bastion) shows Yes/Skip; Skip is a no-op, Yes proceeds to the abandon pick then draws 2.
- A foresee card (Skypath) opens the Foresee overlay and closing it advances the phase.
- An excluded card (Forest Trailhead) applies energy only and shows the **Manual** badge.
- Inspect the captured error buffer for render errors / unhandled rejections / console errors, and confirm overlays are readable and free of clipping at the tested viewport.

Tear down only the QA server you started (`kill <captured PID>` or `pkill -f "vite --port 5174"`) — never a bare `pkill -f vite`.

- [ ] **Step 4: Commit**

```bash
git add src/battle/automation/use-dreamwell-effect-runner.ts
git commit -m "feat(battle): structured logging for dreamwell effect automation"
```

---

## Self-review

**Spec coverage:** Choice-handling via interactive prompts → Tasks 3,5,6,7. Per-UUID effect table → Tasks 2,3. UI-layer runner, no state-schema change → Tasks 4,6. Four prompt kinds → Task 1 types, Task 3 usage, Task 5 overlays. 29 included / 4 excluded with Auto/Manual badge → Tasks 2,3,7. Structured logging → Task 8. Pure-logic tests keyed on UUID/semantics not rendered text → Tasks 2,3,4. Browser QA → Task 8. Known limitations (Silent Winter EOT, played-card triggers manual) documented in Task 3 / Background. All spec sections map to a task.

**Type consistency:** `StepContext`, `DreamwellPrompt`, `DreamwellEffectStep`, `DreamwellEffectScript` (Task 1) are consumed unchanged by the table (Tasks 2,3) and core (Task 4). `DreamwellActivePrompt` / `DreamwellPromptResolution` (Task 4) are produced by the core and consumed by the hook (Task 6) and screen (Task 7) with matching shapes. `dispatchEdit: (edit: BattleDebugEdit) => void` is consistent between Task 6's args and Task 7's `dispatchAutomationEdit`.

**Snippet justification:** Embedded code is limited to (a) the shared type contract every task depends on, (b) the four genuinely non-obvious builders (Twin Moons two-step, Celestial Gateway RNG, Ruin Tree confirm-nesting, Shining Beacon two-half resolve) where a naive implementation would diverge, (c) the runner-core signatures and the race-sensitive hook structure, and (d) exact insertion points in `PlayableBattleScreen`. The 23 mechanical table entries are described in prose pointing at the spec mapping, not transcribed.

**Test value:** Helper tests catch wrong-zone/type/cost filters and draw-count off-by-ones. The status partition test catches double-listed or malformed ids. Representative-builder tests are one-per-shape, not one-per-card. Two property tests (over all `edits` steps; over all prompt resolvers) catch selector typos across every entry without mirroring the table. The runner-core confirm-yes test catches the single highest-risk control-flow bug (dropping `onYes` or the queue tail). `togglePick` test catches over-selection. No test pins a tuning constant or asserts the table contains what it contains.
