# Manual-Control Battle Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each phase ends green (lint + typecheck + test + browser QA) and is independently shippable.

**Goal:** Convert the quest-prototype battle screen from a rules-enforcing engine into a manual sandbox: the player drags any card between any zones on either side, nothing changes energy/score/phase/result automatically, and there is no card-playability dimming, judgment execution, victory detection, or AI.

**Architecture:** The battle already has a clean command layer (`BattleCommand` → `applyBattleCommand` → `battleReducer`) and a rich set of *unrestricted* manual operations as debug edits (`SET/ADJUST_CURRENT_ENERGY`, `MOVE_CARD_TO_ZONE` for every zone, `DRAW_CARD`, `FORCE_RESULT`/`SKIP_TO_REWARDS`). This refactor leans on that existing manual machinery: it routes every normal player gesture through the unrestricted `MOVE_CARD_TO_ZONE` move, deletes the automatic engine (turn flow, judgment, result evaluation, AI), and strips the UI's rule-driven dimming/disabling. State changes only ever happen as a direct result of one player gesture or an explicit debug edit.

**Tech Stack:** React 19, Vite 7, TypeScript 5.8 (strict, bundler mode), Vitest, `agent-browser` for browser QA. All battle code lives under `src/battle/`.

---

## Design Decisions (do not re-litigate)

These were confirmed with the product owner. Implement them as written.

1. **No automatic energy.** Moving/playing a card never changes `currentEnergy` or `maxEnergy`. Energy is changed only by the existing manual `SET/ADJUST_CURRENT_ENERGY` / `SET/ADJUST_MAX_ENERGY` debug edits (already wired through the inspector).
2. **No Challenge/judgment execution.** Spark comparison, lane resolution, dissolutions, and score deltas are removed entirely — including the manual `FORCE_JUDGMENT` debug button. Players compare spark themselves and resolve a challenge by manually dragging losing cards to the void and adjusting score with the existing score debug edits.
3. **No turn bookkeeping.** Delete the "End Turn" / "Pass Phase" / "Next Turn" controls and all the logic behind them (start-of-turn energy refresh, automatic draw, exhaustion penalty, note expiry, extra turns, phase auto-advance, AI follow-ups). Replace with a **display-only phase control**: an arrow icon-button that cycles the phase label `Dawn → Day → Dusk → Night → Dawn`, plus click-to-set on the phase display. This control carries **no business logic** — it changes `state.phase` and nothing else.
4. **No victory/defeat detection.** Score crossing the target or the turn limit does nothing. `result` is set only by the manual `FORCE_RESULT` / `SKIP_TO_REWARDS` controls (the reward surface still opens when a victory is *forced*).
5. **No dimming.** Never dim, grey, ring, or disable a card based on affordability, phase, active side, slot occupancy, or reserved status.
6. **Drag anything anywhere, any side.** Any card can be dragged from any zone to any zone/slot on either side. Cross-side moves are allowed and update the card's `controller` to the destination side (the existing `MOVE_CARD_TO_ZONE` already does this).
7. **Manual equivalents already exist** for energy, score, draw, move-to-any-zone, force-result. Do **not** build new debug surfaces for them; reuse them.
8. **Shared engine.** `src/battle/` is shared by the single-player screen *and* Firebase multiplayer (`src/multiplayer/battle-service.ts`, `src/state/multiplayer-battle-context.tsx`) and the AI. Removing engine functions and reducer actions requires updating those consumers so the build stays green. Multiplayer becomes manual-control too; this is intended.

### Behaviors deliberately kept

- **Undo/redo, history, logging** — unchanged. Every manual move still commits a history entry and emits log events.
- **`result` field, reward surface, defeat/draw overlay, quest-completion bridge** — kept, but `result` is now reachable only by `FORCE_RESULT`/`SKIP_TO_REWARDS`.
- **Figment stacking/merging on move** — kept (it is a property of how figments occupy a slot, not rules enforcement).
- **Opponent-hand visibility, notes, markers, foresee, deck reorder, figment creator, zone browser, inspector** — kept; these are inspection/debug tools, not enforcement.
- **`turnNumber` and `activeSide`** — no longer mutated by anything; they sit at their initial values (`turnNumber: 1`, `activeSide: "player"`) for the life of the battle. No manual setter is added for them (out of scope).

### One documented enforcement we keep for physical reasons

A battlefield slot holds exactly one (non-figment) card. Dropping a card onto an **occupied** slot:
- If the dragged card also came from a battlefield slot → **swap** the two (existing `SWAP_BATTLEFIELD_SLOTS`).
- Otherwise (e.g. from hand onto an occupied slot) → **no-op**; the player must target an empty slot or move the occupant away first.

This is the only placement restriction that survives, and it is physical, not a rule. Document it in code comments where the routing lives.

---

## Current Automation / Enforcement Inventory (reference map)

This is the full set of behaviors being removed or neutralized, with their owning code. Use it as a checklist; every row must be addressed by some task.

| # | Behavior | Owning code | Disposition |
|---|----------|-------------|-------------|
| A1 | Energy deducted on play | `engine/play-card.ts` `resolveCharacterPlay`/`resolveNonCharacterPlay`/`resolvePlayCardToStack` | Delete file; plays become plain moves |
| A2 | Start-of-turn energy refresh (+1 max, refill) | `engine/turn-flow.ts` `runStartOfTurnComposite` | Delete file |
| B1 | Auto judgment on end of turn | `engine/turn-flow.ts` `advanceAfterEndTurn` + `buildJudgmentTransition` | Delete |
| B2 | Spark comparison / dissolution / score delta | `engine/judgment.ts` (all) | Delete file |
| B3 | Manual judgment button | `state/apply-debug-edit.ts` `forceJudgment` + `FORCE_JUDGMENT` edit | Delete |
| C1 | Victory/defeat/draw from score target & turn limit | `engine/result.ts` `evaluateBattleResult`, `applyBattleResult`, `isTurnLimitReached` | Delete evaluation; keep only forced-result application |
| C2 | Exhaustion penalty (opponent scores on empty draw) | `engine/turn-flow.ts` `applyExhaustionPenalty` | Delete |
| C3 | Auto-clear stale forced result | `state/use-auto-clear-forced-result.ts`, `reducer.ts` `clearStaleForcedResultInPlace`, `selectors.ts` `shouldAutoClearForcedResult`, controller `CLEAR_FORCED_RESULT` | Delete |
| D1 | Auto-draw at turn start | `engine/turn-flow.ts` `drawTopCardForTurn` | Delete (manual `DRAW_CARD` exists) |
| D2 | Phase auto-advance & End Turn/Pass Phase composites | `engine/turn-flow.ts` `passBattlePhase`; `reducer.ts` `END_TURN`/`PASS_PHASE` + `endTurnWithAiFollowup`/`passPhaseWithAiFollowup` | Delete |
| D3 | "Auto end turn from Day when no fast plays" | `selectors.ts` `selectShouldEndTurnFromDay`/`selectHasAffordableFastSpeedHandPlay` | Delete |
| D4 | Extra-turn handling / reserve-restriction clearing | `turn-flow.ts`; `GRANT_EXTRA_TURN` edit; `pendingExtraTurns`; `enteredReserveTurnNumber` | Delete |
| D5 | Note expiry at start of turn | `turn-flow.ts` `expireBattleNotes` | Delete (manual dismiss exists) |
| E1 | AI opening-turn bootstrap | `state/use-ai-turn-driver.ts`, controller/reducer `RUN_AI_TURN`, `ai/run-ai-turn.ts`, `ai/choose-action.ts`, `enableAi` | Delete |
| F1 | Play rejection (not-in-hand, slot occupied, cross-side, no-open-slot, event-with-target) | `engine/play-card.ts` `buildPlayRejectedTransition` & callers | Delete with file |
| F2 | Reserve→deployed "summoning sickness" | `play-card.ts` reserved-this-turn guard; `selectors.ts` `selectIsBattleCardReservedThisTurn`; `enteredReserveTurnNumber` | Delete |
| F3 | Same-side move enforcement | `play-card.ts` `resolveMoveCard`/`resolveStackCardMove` side checks | Gone with file; `MOVE_CARD_TO_ZONE` is already cross-side |
| F4 | Character-forced-to-reserve / event-forced-to-void on play | `play-card.ts` | Gone; moves go exactly where dropped |
| G1 | Unaffordable dimming (brightness/saturation) | `battle.css` `.unaffordable`; `BattleHandTray.tsx`, `BattleOpponentHandTray.tsx` | Remove class + CSS |
| G2 | Playable ring/highlight | `battle.css` `.playable`; `isPlayable` in hand trays | Remove |
| G3 | `draggable` gated by playability/phase | `BattleHandTray.tsx`, `BattlefieldGrid.tsx` | Always draggable |
| G4 | Reserved indicator dot | `battle.css` `.reserved::after`; `BattlefieldGrid.tsx`, `BattleInspector.tsx` | Remove |
| G5 | End Turn button + `disabled={!canEndTurn}` + `E` key | `BattleActionBar.tsx`; `selectCanEndTurn` | Delete button & shortcut |
| G6 | Phase/affordability gating of double-click play, slot-click play, reposition | `PlayableBattleScreen.tsx` `canPlayerAct`/`canBattlefieldSideReposition`/`canPlayHandCardWithoutOverride`; `selectCanTakeMainPhaseActions`/`selectCanRepositionInCurrentPhase`/`selectCanPlayCardInCurrentPhase` | Delete gating; route gestures as moves |
| G7 | Context-menu "Override cost →" affordability labels | `BattleContextMenu.tsx` | Plain labels; route as moves |
| H1 | Reward surface auto-open on `result==="victory"` | `PlayableBattleScreen.tsx` effect | Keep (now only fires on forced victory) |
| I1 | Bootstrap runs start-of-turn composite | `state/use-ensure-battle-session.ts`, `multiplayer/battle-service.ts` call `prepareInitialBattleState` | Use raw `createInitialBattleState` |

---

## File Structure

**Files to delete** (source + co-located test):
- `src/battle/engine/turn-flow.ts` (+ `turn-flow.test.ts`)
- `src/battle/engine/judgment.ts` (+ `judgment.test.ts`)
- `src/battle/engine/play-card.ts` (+ `play-card.test.ts`)
- `src/battle/ai/run-ai-turn.ts` (+ `run-ai-turn.test.ts`)
- `src/battle/ai/choose-action.ts` (+ `choose-action.test.ts`)
- `src/battle/state/use-ai-turn-driver.ts` (+ `use-ai-turn-driver.test.tsx`)
- `src/battle/state/use-auto-clear-forced-result.ts` (+ `use-auto-clear-forced-result.test.tsx`)

**Files reduced to a thin manual core:**
- `src/battle/engine/result.ts` — keep only forced-result application; delete `evaluateBattleResult`, `applyBattleResult`, `isTurnLimitReached`, score-target logic.

**Files modified** (primary): `src/battle/types.ts`, `src/battle/state/reducer.ts`, `src/battle/state/controller.ts`, `src/battle/state/selectors.ts`, `src/battle/state/apply-debug-edit.ts`, `src/battle/debug/commands.ts`, `src/battle/debug/apply-command.ts`, `src/battle/components/PlayableBattleScreen.tsx`, `src/battle/components/BattleActionBar.tsx`, `src/battle/components/BattleStatusBar.tsx`, `src/battle/components/BattleHandTray.tsx`, `src/battle/components/BattleOpponentHandTray.tsx`, `src/battle/components/BattlefieldGrid.tsx`, `src/battle/components/BattleContextMenu.tsx`, `src/battle/components/BattleInspector.tsx`, `src/battle/battle.css`.

**Files modified** (consumers, to keep build green): `src/state/use-ensure-battle-session.ts`, `src/multiplayer/battle-service.ts`, `src/state/multiplayer-battle-context.tsx`, `src/runtime/runtime-config.ts` (drop `enableAi`), `src/components/BattleSiteRoute.tsx`, `src/state/quest-context.tsx`.

---

## Phasing

Phases are ordered so the app is usable after each one. Phase 1 is pure presentation (instant, safe win). Phase 2 makes movement free and energy-neutral. Phase 3 deletes turn bookkeeping and adds the phase control. Phase 4 removes result detection. Phase 5 cleans shared-engine consumers and dead types. Within a phase, do the steps in order; commit at each task boundary.

---

## Phase 1 — Remove all rule-driven dimming, rings, and disabling

Goal: every card is always fully bright and draggable; no control is disabled because of game rules. No dispatch behavior changes yet (drags still route through the old actions). This isolates the visual change from the logic change.

### Task 1.1: Hand cards always bright and draggable

**Files:**
- Modify: `src/battle/components/BattleHandTray.tsx` (affordability/playable logic at ~lines 78–145)
- Modify: `src/battle/components/BattleOpponentHandTray.tsx` (~lines 48–61)
- Modify: `src/battle/battle.css` (`.unaffordable` ~561–563 & 607–609; `.playable` ~568–589)
- Test: `src/battle/components/BattleHandTray.test.tsx`

- [ ] **Step 1: Write/adjust the failing test.** In `BattleHandTray.test.tsx`, assert the invariant that **no hand card carries the `unaffordable` or `playable`/`unplayable` class and every hand card element is `draggable`, regardless of `currentEnergy` or phase.** Render the tray with a card whose `energyCost` exceeds `currentEnergy`. Bug class caught: energy-based dimming or non-draggable gating reappearing.
- [ ] **Step 2: Run it; expect FAIL** (`npx vitest run src/battle/components/BattleHandTray.test.tsx`) because the current code adds `unaffordable` and sets `draggable={isPlayable}`.
- [ ] **Step 3: Implement.** In `BattleHandTray.tsx` delete `isUnaffordable`/`isPlayable` computation and the `unaffordable`/`playable` class strings; set `draggable` to a constant `true`; keep `data-battle-card-playable` only if other code reads it (grep first — if unused, remove it). Do the same removal of `unaffordable` in `BattleOpponentHandTray.tsx`. In `battle.css` delete the `.battle-card.hand-card.quest-card.unaffordable`, `.battle-card.unaffordable`, `.battle-card.hand-card.quest-card.playable…`, and `.battle-card.playable` rules.
- [ ] **Step 4: Run the test; expect PASS.**
- [ ] **Step 5: Commit** (`feat(battle): hand cards always bright and draggable`).

### Task 1.2: Battlefield cards always draggable; remove reserved indicator

**Files:**
- Modify: `src/battle/components/BattlefieldGrid.tsx` (`draggable={canInteract}` ~line 147; `reserved={…}` ~line 145)
- Modify: `src/battle/components/BattleInspector.tsx` (reserved badge ~lines 214/227/250)
- Modify: `src/battle/battle.css` (`.reserved::after` ~596–605)
- Test: `src/battle/components/BattlefieldGrid.test.tsx`

- [ ] **Step 1: Test** — assert every battlefield card tile is `draggable` even when the grid's `canInteract` prop is `false`, and that no tile renders the `reserved` class. Bug class: reposition-phase gating or summoning-sickness indicator persisting.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** — make `draggable` constant `true`; remove the `reserved` prop wiring and `selectIsBattleCardReservedThisTurn` call in `BattlefieldGrid.tsx`; remove the reserved badge in `BattleInspector.tsx`; delete the `.reserved::after` CSS. Leave `canInteract` prop in place for now (Phase 2 removes its remaining readers) but stop using it to gate `draggable`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit.**

### Task 1.3: Delete the End Turn / Pass Phase control and the `E` shortcut

**Files:**
- Modify: `src/battle/components/BattleActionBar.tsx` (whole phase-action block: `phaseButtonLabel`/`phaseActionCommand` ~43–44, `E` key handler ~57–64, the `end-turn` button ~146–154, `getPhaseButtonLabel`/`createPhaseActionCommand` ~160–178, and the `canEndTurn` prop)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (the `canEndTurn` computation ~line 168 and the prop it passes to `BattleActionBar`)
- Test: `src/battle/components/PlayableBattleScreen.test.tsx`

> The "Skip to rewards" button stays. Undo/Redo/Log/opponent-hand toggle stay.

- [ ] **Step 1: Test** — in `PlayableBattleScreen.test.tsx` assert there is **no** element with `data-battle-action="end-turn"` and that pressing `e` dispatches nothing. Bug class: a turn-advancing control surviving the refactor.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** — remove the `end-turn` button, the phase-action command builders, the `E` key branch, and the `canEndTurn` prop from `BattleActionBar.tsx`; remove the now-unused `canEndTurn` computation and `selectCanEndTurn` import from `PlayableBattleScreen.tsx`. (Keyboard handler keeps undo/redo.)
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`feat(battle): remove End Turn / Pass Phase controls`).

### Task 1.4: Stop gating gestures on phase/affordability/active-side

**Files:**
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (`canPlayerAct`/`canPlayerReposition`/`canEnemyReposition` ~169–172, `canPlayHandCardWithoutOverride` ~224–233, `canBattlefieldSideReposition` ~235–237, and their use sites in the drag/click handlers and the `canInteract`/`isCardPlayable` props passed to hand trays and battlefield grids ~904–1112)
- Test: `src/battle/components/PlayableBattleScreen.test.tsx`

- [ ] **Step 1: Test** — assert that double-clicking a hand card whose cost exceeds energy, while the phase is `night`, still dispatches a play/move command (i.e. the gesture is never silently swallowed by a phase/affordability check). Bug class: hidden gating that makes a gesture a no-op.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** — replace `canPlayerAct` and friends with constant `true` at their use sites, then delete the now-dead helper functions and the `selectCanTakeMainPhaseActions`/`selectCanRepositionInCurrentPhase`/`selectCanPlayCardInCurrentPhase` imports. Pass `canInteract={true}` (or remove the prop entirely if the grid no longer reads it after 1.2/Phase 2). Pass `isCardPlayable={undefined}` or remove it. **Do not** yet change which action each gesture dispatches — that is Phase 2.
- [ ] **Step 4: Run; expect PASS.** Then run the full battle test file; update any test that asserted a gesture was blocked by phase/energy to assert it now succeeds.
- [ ] **Step 5: Commit.**

### Task 1.5: Phase 1 verification

- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`. Fix fallout (mostly tests asserting removed classes/disabled states).
- [ ] Browser QA (`agent-browser`, `http://localhost:5173/?startInBattle=1`): confirm an unaffordable hand card is full-brightness and draggable; confirm there is no End Turn button; confirm undo/redo/log still work. Screenshot evidence per the quest-battle QA rules.
- [ ] Commit any test fixups.

---

## Phase 2 — One unrestricted move for every gesture; no energy on play

Goal: every card-movement gesture (drag, double-click, context-menu "move", slot click) dispatches the unrestricted `MOVE_CARD_TO_ZONE` (or `SWAP_BATTLEFIELD_SLOTS` for an occupied battlefield-to-battlefield swap). Energy is never touched by a move. Cross-side and any-zone moves work. The enforcement-bearing commands/actions (`PLAY_CARD`, `PLAY_CARD_TO_STACK`, `MOVE_STACK_CARD`, `MOVE_CARD`) and `engine/play-card.ts` are removed.

### Task 2.1: Extend the manual move to accept the stack as a destination

The current `MOVE_CARD_TO_ZONE` already moves to hand/void/banished/deck/reserve/deployed and across sides (updating `controller`), and can already remove a card *out of* the stack. It cannot move a card *into* the stack. Add that so the stack is a first-class drag target.

**Files:**
- Modify: `src/battle/debug/commands.ts` (`BattleDebugZoneDestination` ~30–40; `formatZoneDestinationLabel`/`formatZoneLabel` ~903–936; `collectDebugEditTargets` MOVE_CARD_TO_ZONE branch ~725–731 and `makeZoneTarget` union ~607–615)
- Modify: `src/battle/state/apply-debug-edit.ts` (`insertBattleCardAtDebugDestination` ~1441–1462; `isSameLocation` ~1380–1410; `isDebugDestinationPlaceable` — find its definition; `moveCardToDebugZone` ~1085–1159)
- Test: `src/battle/state/apply-debug-edit.test.ts` (or `reducer.test.ts`)

Contract — extend the destination union with `stack`:

```ts
export type BattleDebugZoneDestination =
  | BattleFieldSlotAddress
  | { side: BattleSide; zone: "hand" | "void" | "banished" | "stack" }
  | { side: BattleSide; zone: "deck"; position: "top" | "bottom" };
```

- [ ] **Step 1: Test** — pin two invariants: (a) moving a hand card to `{ side, zone: "stack" }` removes it from hand and appends a `BattleStackEntry` `{ stackEntryId, battleCardId, side, paidCost: 0 }`; (b) moving that stack card to the void removes the stack entry and pushes it to void. Bug class: stack-destination plumbing missing a branch (id allocation, controller update, same-location no-op).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** — in `insertBattleCardAtDebugDestination`, handle `zone === "stack"` by allocating a stack entry id (`allocateBattleStackEntryId`) and pushing `{ stackEntryId, battleCardId, side: destination.side, paidCost: 0 }` to `state.stack`. In `isSameLocation`, a stack source → stack destination is a no-op. In `isDebugDestinationPlaceable`, the stack is always placeable. Add `"stack"` to the zone label/target helpers. Keep the existing `controller = destination.side` assignment.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`feat(battle): allow moving cards onto the stack via the manual move`).

### Task 2.2: Route every screen gesture through the manual move

**Files:**
- Modify: `src/battle/components/PlayableBattleScreen.tsx` — `handleHandCardDoubleClick` (~352–363), `handleCardDragStart` (~599–617), `handleSlotDrop` (~619–655), `handleZoneDrop` (~657–671), `handleStackDrop` (~673–687), `handleBattlefieldSlotClick`/`handleSelectedBattlefieldTargetClick` (~371–473), and the battlefield "events" drop zone (~962–978)
- Reuse: `src/battle/components/battle-ui-commands.ts` (`createMoveCardToBattlefieldCommand`, `createMoveCardToRowCommand`, `createMoveCardToZoneCommand`, `createMoveCardToDeckCommand`) plus a new stack helper
- Test: `src/battle/components/PlayableBattleScreen.test.tsx`

Routing table (every gesture → exactly one command). Document this table as a comment block above the drag handlers:

| Gesture | Destination | Command dispatched |
|---------|-------------|--------------------|
| Drag/drop onto **empty** battlefield slot | that slot | `MOVE_CARD_TO_ZONE` (destination = slot) |
| Drag/drop onto **occupied** battlefield slot, source is a battlefield slot | swap | `SWAP_BATTLEFIELD_SLOTS` |
| Drag/drop onto **occupied** battlefield slot, source not a battlefield slot | — | no-op (documented physical restriction) |
| Drag/drop onto hand/void/banished zone button | that zone | `MOVE_CARD_TO_ZONE` (destination = `{ side, zone }`) |
| Drag/drop onto deck zone | deck top | `MOVE_CARD_TO_ZONE` (destination = `{ side, zone:"deck", position:"top" }`) |
| Drag/drop onto stack zone | stack | `MOVE_CARD_TO_ZONE` (destination = `{ side, zone:"stack" }`) |
| Double-click a hand card | first open reserve slot on that card's side, else first open deployed slot | `MOVE_CARD_TO_ZONE` via `createMoveCardToBattlefieldCommand` |

Notes for the implementer:
- The drop's *side* comes from the drop target (e.g. dropping on the enemy battlefield slot uses `side: "enemy"`), enabling cross-side moves. Do not force `side` to the dragged card's current side.
- Remove the `pendingDrag.kind === "event"` special-casing of the battlefield drop zone; events drop onto slots like anything else.
- Remove the hand-only / stack-only affordability checks in `handleStackDrop` and `handleHandCardDoubleClick`.

- [ ] **Step 1: Test** — pin three contracts in `PlayableBattleScreen.test.tsx`: (a) dropping a player hand card onto an **enemy** empty deployed slot dispatches `MOVE_CARD_TO_ZONE` with `destination.side === "enemy"`; (b) double-clicking a hand card moves it to a reserve slot **without changing `currentEnergy`**; (c) dropping a deployed card onto the void zone dispatches `MOVE_CARD_TO_ZONE` to `void`. Bug class: a gesture still routing to `PLAY_CARD`/`MOVE_CARD` (which would re-introduce energy/enforcement) or refusing a cross-side drop.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the routing table. Add a `createMoveCardToStackCommand(battleCardId, side, sourceSurface)` helper to `battle-ui-commands.ts` mirroring `createMoveCardToZoneCommand`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`feat(battle): route all card gestures through the unrestricted move`).

### Task 2.3: Delete `engine/play-card.ts` and the enforcement-bearing commands/actions

**Files:**
- Delete: `src/battle/engine/play-card.ts`, `src/battle/engine/play-card.test.ts`
- Modify: `src/battle/state/reducer.ts` (remove `PLAY_CARD`, `PLAY_CARD_TO_STACK`, `MOVE_STACK_CARD`, `MOVE_CARD` cases ~102–181 and their imports; keep `DEBUG_EDIT`, `FORCE_RESULT`)
- Modify: `src/battle/types.ts` (remove those four variants from `BattleReducerAction` ~537–559)
- Modify: `src/battle/debug/commands.ts` (remove the four ids from `BattleCommandId` and the `BattleCommand` union; remove their metadata factories `createPlayCardHistoryMetadata` etc., `buildCommandPayload`/`inferCommandActor`/`createBattleCommandMetadata` switch arms)
- Modify: `src/battle/debug/apply-command.ts` (remove the four `case` arms ~41–67)
- Modify: `src/battle/state/selectors.ts` (delete `selectIsBattleCardReservedThisTurn`, `selectCanPlayCardInCurrentPhase`, `selectHasAffordableFastSpeedHandPlay`, `selectShouldEndTurnFromDay`, `selectCanRepositionInCurrentPhase`, `selectCanTakeMainPhaseActions`, `selectCanEndTurn`)
- Modify: `src/battle/types.ts` `BattleCardInstance` — remove `enteredReserveTurnNumber`
- Tests: delete/trim `reducer.test.ts` blocks for the removed actions; keep `MOVE_CARD_TO_ZONE` coverage.

- [ ] **Step 1: Test** — add/keep a reducer test asserting that there is no longer any code path that decrements `currentEnergy` when a card changes zones (move a character from hand to a deployed slot via `MOVE_CARD_TO_ZONE`; assert both sides' `currentEnergy` and `maxEnergy` are unchanged). Bug class: a residual play path that still pays a cost.
- [ ] **Step 2: Run the targeted test; expect PASS already** (Phase 2.2 routed gestures away from `PLAY_CARD`), then delete the file/actions.
- [ ] **Step 3: Implement** the deletions above. Compiler errors are your checklist — chase every reference to the removed symbols. `figments.ts` helpers used by `play-card.ts` (figment merge on move) are now used only by `apply-debug-edit.ts`; keep them.
- [ ] **Step 4: Run `npm run typecheck` and the battle tests; expect green** after deleting the obsolete `play-card.test.ts` and the action-specific blocks of `reducer.test.ts`.
- [ ] **Step 5: Commit** (`refactor(battle): delete play-card engine and play/move enforcement actions`).

### Task 2.4: Phase 2 verification

- [ ] `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] Browser QA: drag a hand card to your reserve (energy unchanged), to a deployed slot, to the void, to the stack, and onto an **enemy** slot; drag a deployed card back to hand; swap two deployed cards. Screenshot each; confirm counts move and energy never changes.

---

## Phase 3 — Delete turn bookkeeping; add the display-only phase control

Goal: no automatic phase/turn machinery remains, and the player drives the phase label manually.

### Task 3.1: Add the `SET_PHASE` debug edit (display only)

**Files:**
- Modify: `src/battle/debug/commands.ts` (`BattleDebugEdit` union; `resolveDebugEditKind` → `"battle-flow"`; `createDebugEditLabel`; `collectDebugEditTargets` → `[]`; `isCompositeDebugEdit` → false)
- Modify: `src/battle/state/apply-debug-edit.ts` (`applyDebugEdit` switch ~64–298: add `SET_PHASE` case)
- Test: `src/battle/state/apply-debug-edit.test.ts`

Contract:

```ts
| {
    kind: "SET_PHASE";
    phase: BattlePhase;
  }
```

The handler clones state, sets `nextState.phase = edit.phase`, and returns an empty transition. It must touch **nothing else** — not `activeSide`, energy, score, hand, deck, or result.

- [ ] **Step 1: Test** — invariant: applying `SET_PHASE` changes only `phase`; assert `currentEnergy`, `maxEnergy`, `score`, `hand`, `deck`, `result`, `activeSide`, `turnNumber` are byte-for-byte equal before/after. Bug class: business logic leaking into the phase setter.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the edit + handler + metadata (label `Set Phase to <formatPhaseLabel(phase)>`).
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`feat(battle): add display-only SET_PHASE debug edit`).

### Task 3.2: Phase increment arrow + click-to-set in the status bar

**Files:**
- Modify: `src/battle/components/BattleStatusBar.tsx` (the "Active Phase" display ~52–77; add an `onSetPhase` prop)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` (where `BattleStatusBar` is rendered ~864–882 — pass `onSetPhase` that dispatches a `SET_PHASE` `DEBUG_EDIT`)
- Modify: `src/battle/battle.css` (styles for the new icon button / clickable chips, matching existing `phase-track` styling)
- Test: `src/battle/components/BattleStatusBar.test.tsx`

UI behavior:
- An arrow icon-button next to the phase label cycles `dawn → day → dusk → night → dawn` (the order in the existing `phaseSteps` array). Reuse the boxicons `bx` icon set already used here.
- Each phase chip in `phase-track` becomes a button that sets that phase directly (this is the "click within the active phase display to set the active phase" affordance).
- Both call `onSetPhase(nextPhase)`.

- [ ] **Step 1: Test** — (a) clicking the chip with `data-battle-phase-chip="dusk"` calls `onSetPhase("dusk")`; (b) clicking the increment arrow while `phase==="night"` calls `onSetPhase("dawn")`. Bug class: wrong cycle wrap-around or a chip wired to the wrong phase.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the prop, the arrow button, the clickable chips, and the dispatch in `PlayableBattleScreen.tsx`. Keep the existing `normalizeVisiblePhase` for the active-chip highlight.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`feat(battle): manual phase increment and click-to-set control`).

### Task 3.3: Delete `turn-flow.ts`, `judgment.ts`, END_TURN/PASS_PHASE, AI, and exhaustion/extra-turn/note-expiry

**Files:**
- Delete: `src/battle/engine/turn-flow.ts` (+test), `src/battle/engine/judgment.ts` (+test), `src/battle/ai/run-ai-turn.ts` (+test), `src/battle/ai/choose-action.ts` (+test), `src/battle/state/use-ai-turn-driver.ts` (+test)
- Modify: `src/battle/state/reducer.ts` — remove `END_TURN`, `PASS_PHASE`, `RUN_AI_TURN` cases and the `endTurnWithAiFollowup`/`passPhaseWithAiFollowup`/`mergeTransitions` helpers and turn-flow/AI imports
- Modify: `src/battle/state/controller.ts` — remove the `RUN_AI_TURN` action arm (~58–70)
- Modify: `src/battle/types.ts` — remove `END_TURN`/`PASS_PHASE`/`RUN_AI_TURN` from `BattleReducerAction`; remove `enableAi` from `BattleInit` and the `battleReducer`/controller `Pick<…>` signatures; remove now-unused transition fields if dead (`BattleJudgmentResolution`, `BattleLaneJudgment`, `BattleScoreChange`, `pendingExtraTurns`, `exhaustionPenalty*` — verify no remaining readers before deleting; some appear in log/transition types that may still be referenced)
- Modify: `src/battle/debug/commands.ts` — remove `END_TURN`/`PASS_PHASE` ids + metadata; remove `FORCE_JUDGMENT` and `GRANT_EXTRA_TURN` edits, their `resolveDebugEditKind`/`createDebugEditLabel`/`collectDebugEditTargets`/`isCompositeDebugEdit` arms, and `createRunAiTurnHistoryMetadata`
- Modify: `src/battle/debug/apply-command.ts` — remove `END_TURN`/`PASS_PHASE` arms
- Modify: `src/battle/state/apply-debug-edit.ts` — remove `forceJudgment`, `FORCE_JUDGMENT`, `GRANT_EXTRA_TURN` cases and the `judgment`/`turn-flow` imports
- Tests: delete `reducer.test.ts` END_TURN/PASS_PHASE/judgment/AI blocks; remove FORCE_JUDGMENT/GRANT_EXTRA_TURN cases from `apply-debug-edit`/`history-debug` tests.

- [ ] **Step 1: Test** — keep one reducer test pinning the invariant that **no `DEBUG_EDIT` and no surviving action ever mutates `score`, `result`, or dissolves a deployed card** as a side effect of advancing/setting a phase (drive `SET_PHASE` through `dawn→…→night` and assert `score`, deployed slots, `result` unchanged). Bug class: residual judgment/exhaustion firing.
- [ ] **Step 2: Run; expect PASS after deletion** (the behavior is gone). Delete the files and chase compiler errors.
- [ ] **Step 3: Implement** the deletions. The `BattleCommandSourceSurface` `"auto-ai"`/`"auto-system"` literals may be unreferenced now; keep `"auto-system"` only if `result.ts`/logging still emits it, else remove.
- [ ] **Step 4: Run `npm run typecheck` + battle tests; green.**
- [ ] **Step 5: Commit** (`refactor(battle): delete turn-flow, judgment, AI, and exhaustion machinery`).

### Task 3.4: Seed battles from the raw initial state (no start-of-turn composite)

**Files:**
- Modify: `src/state/use-ensure-battle-session.ts` (~line 76: replace `prepareInitialBattleState(...)` with `createInitialBattleState(battleInit)`)
- Modify: `src/multiplayer/battle-service.ts` (~line 261: same replacement)
- Verify: `src/battle/state/create-initial-state.ts` already deals opening hands and sets `OPENING_ENERGY = 2`, `phase: "day"`, `activeSide: "player"` — no change needed.
- Test: `src/battle/state/create-initial-state.test.ts` (the `prepareInitialBattleState` test there is deleted with the function; keep/add a test that `createInitialBattleState` yields the opening hands, 2/2 energy, empty board, `phase: "day"`).

- [ ] **Step 1: Test** — assert a freshly seeded battle has the player opening hand size, `currentEnergy === 2 && maxEnergy === 2` for both sides, empty reserve/deployed/void/banished/stack, and `phase === "day"`. Bug class: bootstrap silently drawing/refreshing because a composite snuck back in.
- [ ] **Step 2: Run; expect FAIL** (import of deleted `prepareInitialBattleState`).
- [ ] **Step 3: Implement** the two call-site swaps and import cleanups.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`refactor(battle): seed battles from raw initial state`).

### Task 3.5: Phase 3 verification

- [ ] `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] Browser QA: confirm the phase arrow cycles Dawn→Day→Dusk→Night→Dawn and that clicking a phase chip jumps to it; confirm score/energy/board never change when cycling; confirm a fresh battle opens in Day with a 5-card hand and 2/2 energy and no auto-draw on load.

---

## Phase 4 — Remove victory/defeat detection; keep manual outcome

Goal: reaching a score target or turn limit does nothing. `result` changes only via `FORCE_RESULT` / `SKIP_TO_REWARDS`. The reward surface still opens when victory is forced.

### Task 4.1: Reduce `result.ts` to forced-result application only

**Files:**
- Modify: `src/battle/engine/result.ts` — delete `evaluateBattleResult`, `applyBattleResult`, `isTurnLimitReached`, and score-target logic. Keep `createFlowStep`, `createEmptyTransitionData`, `createBattleResultChangedLogFields` (used by logging) and the `AUTO_SYSTEM_EMISSION_CONTEXT` if still referenced.
- Modify: `src/battle/state/apply-debug-edit.ts` `forceBattleResult` (~1063–1083) — set both `nextState.forcedResult = result` and `nextState.result = result` directly and return; stop calling `applyBattleResult`/`evaluateBattleResult`.
- Modify: `src/battle/state/reducer.ts` — remove the `RECOMPUTE_RESULT` action and the `commitGameplayTransition` auto-result reconciliation (`clearStaleForcedResultInPlace` + `applyBattleResult`); `DEBUG_EDIT` now commits its transition with no result recompute.
- Modify: `src/battle/types.ts` — remove `RECOMPUTE_RESULT` from `BattleReducerAction`; remove `BattleResultReason`/`forcedResult` only if unreferenced (forcedResult is still used — keep it).
- Modify: `src/battle/state/selectors.ts` — delete `selectNaturalBattleResult` and `shouldAutoClearForcedResult`; keep `selectFailureOverlayResult`.
- Test: `reducer.test.ts` / `apply-debug-edit.test.ts`.

- [ ] **Step 1: Test** — invariant: setting player `score` to `scoreToWin + 10` via `ADJUST_SCORE` leaves `result === null`; and `FORCE_RESULT("victory")` sets `result === "victory"`. Bug class: auto-detection re-creeping in or force-result regressing.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the reductions.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`refactor(battle): outcome is manual; remove score/turn-limit result detection`).

### Task 4.2: Remove auto-clear-forced-result everywhere

**Files:**
- Delete: `src/battle/state/use-auto-clear-forced-result.ts` (+test)
- Modify: `src/battle/components/PlayableBattleScreen.tsx` — remove `useAutoClearForcedResult` call (~185) and import
- Modify: `src/battle/state/controller.ts` — remove `CLEAR_FORCED_RESULT` action arm (~75–76) and `clearForcedResultInPlace`
- Modify: `src/battle/debug/commands.ts` — remove `createClearForcedResultMetadata`
- Modify: `src/multiplayer/battle-service.ts` (~329/351) and `src/state/multiplayer-battle-context.tsx` (~94/100) — remove `CLEAR_FORCED_RESULT` and `RUN_AI_TURN` dispatch/handlers
- Test: `PlayableBattleScreen.test.tsx`.

- [ ] **Step 1: Test** — invariant: after `FORCE_RESULT("defeat")`, performing an unrelated `DEBUG_EDIT` (e.g. move a card) does **not** clear `result`/`forcedResult`; the forced outcome sticks until undo. Bug class: the old auto-clear behavior surviving via a different path.
- [ ] **Step 2: Run; expect FAIL** (auto-clear still wired).
- [ ] **Step 3: Implement** the deletions across single-player and multiplayer.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** (`refactor(battle): remove auto-clear forced-result`).

### Task 4.3: Confirm reward surface still opens on forced victory

**Files:**
- Verify: `src/battle/components/PlayableBattleScreen.tsx` reward effect (~288–320) still keys on `result === "victory"`. No change expected — `SKIP_TO_REWARDS`/`FORCE_RESULT("victory")` set `result`, which fires the effect.
- Test: `PlayableBattleScreen.test.tsx`.

- [ ] **Step 1: Test** — dispatching `SKIP_TO_REWARDS` opens the reward surface (`BattleRewardSurface`), and the defeat/draw overlay opens on `FORCE_RESULT("defeat")`. Bug class: reward/quest-completion flow broken by the result refactor.
- [ ] **Step 2: Run; expect PASS** (no code change) — if it fails, fix the effect to read the manual `result`.
- [ ] **Step 3: Commit** any fix.

### Task 4.4: Phase 4 verification

- [ ] `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] Browser QA: raise player score past the target via the inspector — confirm the battle does **not** end; click "Skip to rewards" — confirm the reward surface opens; undo — confirm it closes and `result` clears.

---

## Phase 5 — Dead-code & type cleanup; docs

### Task 5.1: Remove `enableAi` plumbing and other dead config

**Files:**
- Modify: `src/runtime/runtime-config.ts` (drop `enableAi` field + parse), `src/components/BattleSiteRoute.tsx`, `src/state/quest-context.tsx` (the `enableAi: false` literal), `src/state/use-ensure-battle-session.ts` (`enableAi` input), `src/battle/integration/create-battle-init.ts` (`enableAi` field/default).
- Modify: `docs/quest_prototype/url_parameters.md` — remove the `?enableAi=1` entry.

- [ ] **Step 1:** Delete `enableAi` everywhere the compiler flags it; run `npm run typecheck` as the checklist.
- [ ] **Step 2:** Grep for orphaned symbols: `selectCan*`, `selectShouldEndTurnFromDay`, `selectHasAffordableFastSpeedHandPlay`, `selectIsBattleCardReservedThisTurn`, `enteredReserveTurnNumber`, `pendingExtraTurns`, `BattleLaneJudgment`, `BattleJudgmentResolution`, `RUN_AI_TURN`, `CLEAR_FORCED_RESULT`, `FORCE_JUDGMENT`, `GRANT_EXTRA_TURN`. Each should have zero non-test references. Remove any stragglers.
- [ ] **Step 3:** Commit (`chore(battle): remove dead AI/turn/judgment plumbing`).

### Task 5.2: Update battle docs to describe the manual model

**Files:**
- Modify: `docs/battle_rules/battle_rules.md` and/or add a short `docs/quest_prototype` note describing the prototype's **manual sandbox** behavior (phase is a manual label; energy/score/draw/result are manual; cards drag freely across all zones and sides). Follow the project doc style: describe the current system directly; **do not** write "no longer", "removed", or "unlike before" phrasing.
- Update the `quest-battle` skill's expectations only if a step there now contradicts reality (e.g. references to End Turn flows) — optional.

- [ ] **Step 1:** Write the manual-model description.
- [ ] **Step 2:** Commit (`docs(battle): describe manual-control battle sandbox`).

### Task 5.3: Full-suite + browser regression

- [ ] `npm run lint`, `npm run typecheck`, `npm test` (whole suite, from repo root; `npm install` first in a fresh worktree).
- [ ] `npx vitest run src/battle/components/PlayableBattleScreen.test.tsx`.
- [ ] Browser QA full pass per the quest-battle checklist: drag across every zone and both sides; phase control; manual energy/score/draw via inspector; force result + reward; undo/redo after a sequence of manual moves; foresee/deck-reorder/zone-browser/notes still work. Capture screenshots and inspect the error buffer for render errors / console errors.

---

## Risks & Notes

- **Largest test churn** is `reducer.test.ts` (~46 KB), `turn-flow.test.ts`, `judgment.test.ts`, `play-card.test.ts`, and `PlayableBattleScreen.test.tsx` (~55 KB). Most of those tests assert the very behavior being removed; expect to delete large blocks rather than fix them. Keep tests that pin the *new* invariants (no energy on move, free cross-side movement, SET_PHASE is inert beyond `phase`, no result detection).
- **Multiplayer** (`battle-service.ts`, `multiplayer-battle-context.tsx`) shares the engine and becomes manual too. If a separate decision is later made to keep multiplayer rules-driven, this engine would need to fork — flag to the product owner if multiplayer is actively used.
- **`turnNumber`/`activeSide` are now static.** Some display strings (turn badge, "Player Turn N" announcement in `PlayableBattleScreen` ~1394–1429) will read `Turn 1` / `Player` forever. Acceptable per the manual model; if undesirable, add manual setters in a follow-up (out of scope).
- **`figments.ts`** stays; its merge-on-move helpers are used by `apply-debug-edit.ts`'s `MOVE_CARD_TO_ZONE`.

---

## Spec-coverage self-check

Every inventory row A1–I1 maps to a task: A1/F1/F3/F4 → 2.3; A2/B1/C2/D1/D2/D3/D4/D5 → 3.3; B2 → 3.3; B3 → 3.3; C1 → 4.1; C3 → 4.2; E1 → 3.3 + 5.1; F2 → 2.3; G1/G2/G3 → 1.1/1.2; G4 → 1.2; G5 → 1.3; G6 → 1.4; G7 → 2.2; H1 → 4.3; I1 → 3.4. No row is unassigned.
