# Quest State Debug Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A debug overlay, opened from the quest HUD "..." menu, that edits the live quest state in place — essence/caps, dreamsigns, deck add/remove, and per-card edits (energy cost, spark, transfiguration, type/subtype, keywords, bane).

**Architecture:** A new per-deck-entry `statOverride` field plus a unified `resolveDeckEntryCard` helper carry energy/spark edits into both the deck UI and battle. A small set of optional debug-only `QuestMutations` (alongside the many existing reusable ones) write through `writeRoomTransaction`, preserving quest-state invariants and emitting `quest_debug_edit` log events. A `QuestDebugEditor` overlay (mirroring the existing `DebugScreen` pattern) is wired into the HUD utility menu and `App.tsx`.

**Tech Stack:** TypeScript, React, Framer Motion, Tailwind + inline styles, Vitest. Firebase RTDB persistence via the existing multiplayer quest context.

---

## Background the implementer must not re-derive

- **Spec:** `docs/superpowers/specs/2026-06-24-quest-debug-editor-design.md`.
- **Deck entry shape:** `DeckEntry` in `src/types/quest.ts:91` — `{ entryId, cardNumber, transfiguration, typeChange?, keywordModification?, isBane }`. Base stats (energyCost, spark, subtype) come from `CardData` (`src/types/cards.ts`), keyed by `cardNumber` in `questContent.cardDatabase: Map<number, CardData>`.
- **Resolution chokepoint:** a `DeckEntry` becomes an effective card by applying transfiguration (`applyTransfigurationToCard`, `src/transfiguration/transfiguration-logic.ts:277`, returns a new `CardData`) then `applyDeckEntryCardModification` (`src/card-type-change.ts:87`, applies typeChange + keywords). This pair is duplicated in `normalizePlayerDeckCard` (`src/battle/integration/create-battle-init.ts:709`) and `effectiveCardFor` (`src/journey_v2/archetypes/improve.ts`). Three other callers apply only `applyDeckEntryCardModification` (no transfiguration): `src/components/deck-summary.ts:28`, `src/components/DeckViewer.tsx:141`, `src/components/StartingDeckModal.tsx:81`.
- **Battle reads the real entry:** `normalizePlayerDeckCard(entry, card)` is mapped over `padBattleDeck(state.deck)` (`create-battle-init.ts:229`), i.e. the real `DeckEntry[]` (with `statOverride`). The stripped `BattleQuestDeckEntry` snapshot (`questDeckEntries`) is consumed only by a stats summary in `src/battle/state/selectors.ts`. **Therefore the battle types do not need a `statOverride` field** — baking the stat into the resolved definition is sufficient.
- **Persistence + invariants:** all writes go through `writeRoomTransaction` (`src/state/multiplayer-quest-context.tsx:169`), which runs `validateRoomTransitionInvariants` (forbids nulling `dreamcaller`/`resolvedPackage`/`draftState`, per `src/state/quest-state-invariants.ts`). The editor never exposes clearing those fields.
- **Mutations contract:** `QuestMutations` is declared in `src/state/quest-context.tsx` (interface starts ~line 336 within the file's mutation block) and implemented in `src/state/multiplayer-quest-context.tsx`. Debug-only mutations there are declared **optional** (`?`) so lightweight test/demo stubs need not implement them (see `rerollDreamAugury?`, `bootstrapQaScene?`, `loadQuestState?`).
- **Reusable existing mutations** (do not reimplement): `setEssence(value, source)`, `changeMaxEssence(delta, source)`, `addCard(cardNumber, source)`, `addBaneCard(cardNumber, source)`, `removeCard(entryId, source)`, `transfigureCard(entryId, type|null, effectDescription, effectDetails)`, `changeDeckEntryType(entryId, typeChange, source)`, `changeDeckEntryKeywords(entryId, keywordModification, source)` (additive/merge), `addDreamsign(dreamsign, sourceSiteType, purgeIndex?)`, `removeDreamsign(index, reason)`.
- **Logging:** `logEvent(event, fields)` from `src/logging.ts:73` (writes to `logs/quest-log.jsonl` via the dev server). Room-level audit entries use `buildActionLogEntry` inside the transaction (see `transfigureCard` in `multiplayer-quest-context.tsx`).
- **Overlay + wiring pattern to copy:** `src/screens/DebugScreen.tsx` (Framer Motion full-screen overlay, Escape to close); App wiring at `src/App.tsx` (`debugScreenOpen` state line 64, `handleOpenDebugScreen` line 315, HUD prop `onOpenDebugScreen` line 417, render inside `<ErrorBoundary scope="overlay:debug-screen">` line 468). HUD utility menu lives in `src/components/HUD.tsx` (~lines 408-471); items are `<UtilityMenuButton>` entries; HUD props `onOpenDebugScreen` at line 65/86.
- **Dreamsign catalog:** `questContent.dreamsignTemplates: readonly DreamsignTemplate[]` (`src/data/quest-content.ts:74`). `DreamsignTemplate` = `{ id, name, effectDescription, imageName?, imageAlt? }`. A `Dreamsign` adds `isBane: boolean`.

## Worktree setup (run once before Task 1)

- [ ] From `/Users/dthurn/quest_prototype/.worktrees/quest-debug-editor`, run `npm install`, then `scripts/regenerate-assets.sh` (AGENTS.md requires it for a fresh worktree; no TOML changes here, so expect it to be a no-op or refresh generated artifacts only). Then confirm a clean baseline: `npm run lint && npm run typecheck && npm test`.

---

## Task 1: `statOverride` data model + resolution helpers

**Files:**
- Modify: `src/types/quest.ts` (DeckEntry, ~line 91)
- Modify: `src/card-type-change.ts`
- Test: `src/card-type-change.test.ts`

- [ ] **Step 1: Add the `statOverride` field to `DeckEntry`.**

In `src/types/quest.ts`, add to `DeckEntry` (keep the existing fields):

```ts
  /** Debug-only absolute overrides for printed stats on one concrete deck
   *  entry. Applied last, after transfiguration and card modifications, so an
   *  explicit value wins over transfiguration-derived math. A missing key
   *  leaves the corresponding stat at its resolved value. */
  statOverride?: { energyCost?: number; spark?: number };
```

- [ ] **Step 2: Write failing tests in `src/card-type-change.test.ts`.**

Add a small `CardData`-shaped fixture inline in the test (do not import production data). Specify these guarantees:

  1. **Override wins over transfiguration-derived stats** (catches application-order bug): a card transfigured `Empowered` (halves energy) with a `statOverride.energyCost` resolves to the override value, not the halved value.
  2. **Partial override leaves the other stat intact** (catches "one key clobbers the other"): an override of only `spark` leaves `energyCost` at its resolved value, and vice-versa; an `undefined`/absent key is a no-op.
  3. **`resolveDeckEntryCard` composes all layers** (catches a dropped layer): given an entry with transfiguration + typeChange + keywords + statOverride, the result reflects the subtype change, the keyword change, and the stat override together.

Name the functions under test `applyCardStatOverride` and `resolveDeckEntryCard`.

- [ ] **Step 3: Run the tests, verify they fail** with "not exported / not a function".

Run: `npm test -- src/card-type-change.test.ts`

- [ ] **Step 4: Implement `applyCardStatOverride` and `resolveDeckEntryCard` in `src/card-type-change.ts`.**

`applyCardStatOverride` is a pure stat layer; `resolveDeckEntryCard` is the single canonical resolver that the transfiguration-applying call sites will share:

```ts
import { applyTransfigurationToCard } from "./transfiguration/transfiguration-logic";
import type { CardData } from "./types/cards";
import type { DeckEntry } from "./types/quest";

type CardStatFields = Pick<CardData, "energyCost" | "spark">;

/** Returns a card-like value with absolute debug stat overrides applied.
 *  Absent keys leave the corresponding stat unchanged. */
export function applyCardStatOverride<T extends CardStatFields>(
  card: T,
  statOverride: { energyCost?: number; spark?: number } | null | undefined,
): T {
  if (statOverride == null) return card;
  return {
    ...card,
    ...(statOverride.energyCost !== undefined
      ? { energyCost: statOverride.energyCost }
      : {}),
    ...(statOverride.spark !== undefined ? { spark: statOverride.spark } : {}),
  };
}

/** The canonical deck-entry resolution: transfiguration, then type/keyword
 *  modifications, then debug stat overrides (applied last). */
export function resolveDeckEntryCard(card: CardData, entry: DeckEntry): CardData {
  const transfigured =
    entry.transfiguration === null
      ? card
      : applyTransfigurationToCard(card, entry.transfiguration);
  const modified = applyDeckEntryCardModification(transfigured, {
    typeChange: entry.typeChange,
    keywords: entry.keywordModification,
  });
  return applyCardStatOverride(modified, entry.statOverride);
}
```

Leave the existing `applyDeckEntryCardModification` unchanged (statOverride is a separate, narrower layer so callers that lack `energyCost`/`spark` typing are unaffected).

- [ ] **Step 5: Run the tests, verify they pass.** `npm test -- src/card-type-change.test.ts`

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(quest-editor): add DeckEntry statOverride and resolveDeckEntryCard"`

---

## Task 2: Route battle + display paths through `statOverride`

**Files:**
- Modify: `src/battle/integration/create-battle-init.ts` (`normalizePlayerDeckCard`, ~709-759)
- Modify: `src/journey_v2/archetypes/improve.ts` (`effectiveCardFor`)
- Modify: `src/components/deck-summary.ts:28`, `src/components/DeckViewer.tsx:141`, `src/components/StartingDeckModal.tsx:81`
- Test: `src/battle/integration/create-battle-init.test.ts`

- [ ] **Step 1: Write a failing battle-path test in `create-battle-init.test.ts`.**

Guarantee (catches the battle path ignoring `statOverride`): build a minimal quest state with a single deck entry whose `cardNumber` is a real card pulled from the test's card database, set `statOverride: { energyCost: P+7, spark: Q+7 }` where `P`/`Q` are that card's printed values read from the DB (so the assertion is resilient to TOML edits — assert against `printed+7`, never a literal). Run `createBattleInit` and assert the produced player `BattleDeckCardDefinition` for that entry has `printedEnergyCost === P+7` and `printedSpark === Q+7`. Follow the existing harness/fixture setup already used in this test file.

- [ ] **Step 2: Run it, verify it fails** (definition still shows printed values). `npm test -- src/battle/integration/create-battle-init.test.ts`

- [ ] **Step 3: Switch the transfiguration-applying call sites to `resolveDeckEntryCard`.**

In `normalizePlayerDeckCard` (`create-battle-init.ts`), replace the two-line `transfiguredCard` + `applyDeckEntryCardModification` block with a single `const effectiveCard = resolveDeckEntryCard(card, entry);` and update the import. In `effectiveCardFor` (`improve.ts`), replace its transfiguration + `applyDeckEntryCardModification` body with `return resolveDeckEntryCard(deckCard.card, deckCard.deckEntry);`. Do **not** touch the preview/hypothetical `applyDeckEntryCardModification` calls elsewhere in `improve.ts` (they build proposed modifications, not the entry's committed state).

- [ ] **Step 4: Apply `statOverride` in the three non-transfiguration display callers.**

In `deck-summary.ts`, `DeckViewer.tsx`, and `StartingDeckModal.tsx`, wrap each existing `applyDeckEntryCardModification(card, { typeChange, keywords })` result with `applyCardStatOverride(result, entry.statOverride)` (import `applyCardStatOverride`). This preserves their current transfiguration behavior (unchanged) while making stat edits visible. In `deck-summary.ts` specifically, the average-energy accumulator currently reads `card.energyCost` (the raw base) — switch it to read the override-applied effective value so an edited cost is reflected in the summary.

- [ ] **Step 5: Run tests, verify pass.** `npm test -- src/battle/integration/create-battle-init.test.ts src/card-type-change.test.ts`, then `npm run typecheck`.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(quest-editor): apply statOverride in battle and deck display paths"`

---

## Task 3: Debug-only context mutations

**Files:**
- Modify: `src/state/quest-context.tsx` (`QuestMutations` interface)
- Modify: `src/state/multiplayer-quest-context.tsx` (implementations + provider value object)
- Test: `src/state/multiplayer-quest-context.test.tsx`

Seven new mutations, all declared **optional** (`?`) on `QuestMutations` to match the existing debug-only pattern. Reuse semantics from the spec; replace-not-merge for the keyword/type setters so the editor can clear back to printed.

- [ ] **Step 1: Add the optional signatures to `QuestMutations` in `quest-context.tsx`:**

```ts
  /** Debug-only: set `essenceCap` to `value`; current essence reclamps. */
  setEssenceCap?: (value: number, source: string) => void;
  /** Debug-only: set `maxDreamsigns` to `value`. */
  setMaxDreamsigns?: (value: number, source: string) => void;
  /** Debug-only: set `completionLevel` to `value`. */
  setCompletionLevel?: (value: number, source: string) => void;
  /** Debug-only: set or clear absolute stat overrides on a deck entry. */
  setDeckEntryStatOverride?: (
    entryId: string,
    statOverride: { energyCost?: number; spark?: number } | null,
    source: string,
  ) => void;
  /** Debug-only: replace (not merge) a deck entry's keyword modification, or
   *  clear it with `null`. */
  setDeckEntryKeywords?: (
    entryId: string,
    keywordModification: CardKeywordModification | null,
    source: string,
  ) => void;
  /** Debug-only: replace or clear a deck entry's type/subtype override. */
  setDeckEntryTypeChange?: (
    entryId: string,
    typeChange: CardTypeChange | null,
    source: string,
  ) => void;
  /** Debug-only: set the `isBane` flag on the dreamsign at `index`. */
  setDreamsignIsBane?: (index: number, isBane: boolean, source: string) => void;
```

- [ ] **Step 2: Write failing tests in `multiplayer-quest-context.test.tsx`.** Use the existing `onQuest`/captured-`QuestContextValue` harness in that file (see its `onQuest` helper around line 486). Specify these guarantees:

  1. **`setDeckEntryStatOverride` writes only the targeted entry** (catches wrong-entry / whole-deck clobber): with a two-entry deck, setting an override on entry B leaves entry A's `statOverride` absent and sets B's to the given value; passing `null` removes the field from B.
  2. **Scalar setters update their field** (catches no-op / wrong field): `setMaxDreamsigns(N)` and `setCompletionLevel(N)` set exactly those fields; `setEssenceCap(N)` sets the cap and reclamps `essence` to `min(essence, N)`.
  3. **Debug edits preserve run invariants** (catches accidental invariant break): after a `setDeckEntryStatOverride` edit on a state that has a `dreamcaller`, `state.dreamcaller` is still non-null (the edit goes through `writeRoomTransaction`'s validator without tripping it).

  Do not assert any production card stat or name; build deck entries from a fixture or a real `cardNumber` whose printed value you read from the test DB.

- [ ] **Step 3: Run, verify failures** (mutations undefined). `npm test -- src/state/multiplayer-quest-context.test.tsx`

- [ ] **Step 4: Implement the seven mutations in `multiplayer-quest-context.tsx`.**

Each is a `useCallback` following the established `changeDeckEntryType` shape: read `currentRef.current`, `writeRoomTransaction` with an updater that no-ops when `room`/`questState` is null (or the target entry/index is missing), maps/sets the field immutably, bumps `metadata.updatedAt`. Add each to the provider's `mutations` value object (near the existing deck/essence mutations). Representative implementation for the deck-entry stat override (the others follow the same shape over their respective field; the scalar setters write the scalar directly):

```ts
const setDeckEntryStatOverride = useCallback(
  (
    entryId: string,
    statOverride: { energyCost?: number; spark?: number } | null,
    source: string,
  ) => {
    const current = currentRef.current;
    const now = new Date().toISOString();
    writeRoomTransaction({
      database: current.database,
      roomId: current.session.roomId,
      updater: (room) => {
        if (room === null || room.questState === null) return room ?? undefined;
        const entry = room.questState.deck.find((c) => c.entryId === entryId);
        if (entry === undefined) return room;
        logEvent("quest_debug_edit", {
          target: "deckEntry",
          field: "statOverride",
          entryId,
          cardNumber: entry.cardNumber,
          before: entry.statOverride ?? null,
          after: statOverride,
          source,
        });
        return {
          ...room,
          questState: {
            ...room.questState,
            deck: room.questState.deck.map((c) =>
              c.entryId === entryId
                ? statOverride === null
                  ? omitStatOverride(c)
                  : { ...c, statOverride }
                : c,
            ),
          },
          metadata: { ...room.metadata, updatedAt: now },
        };
      },
    });
  },
  [],
);
```

Add a tiny local `omitStatOverride(entry)` helper that returns the entry without the `statOverride` key (Firebase rejects explicit `undefined`; clearing must drop the key). The scalar setters (`setEssenceCap`, `setMaxDreamsigns`, `setCompletionLevel`) write the field directly and `setEssenceCap` reclamps via the existing `clampEssence` (`src/state/quest-state-actions.ts:51`). `setDeckEntryKeywords`/`setDeckEntryTypeChange` mirror the stat-override shape, dropping the key on `null`. `setDreamsignIsBane` maps `dreamsigns[index]` to `{ ...d, isBane }`. Every mutation emits a `quest_debug_edit` `logEvent` with `{ target, field, before, after, source }` (and `entryId`/`index` where applicable) so a run's manual edits are reconstructable from `logs/quest-log.jsonl` (AGENTS.md).

- [ ] **Step 5: Run tests + typecheck, verify pass.** `npm test -- src/state/multiplayer-quest-context.test.tsx && npm run typecheck`

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(quest-editor): add debug-only quest-state mutations with quest_debug_edit logging"`

---

## Task 4: `QuestDebugEditor` overlay component

**Files:**
- Create: `src/screens/QuestDebugEditor.tsx` (overlay shell + Resources + Dreamsigns sections)
- Create: `src/screens/QuestDebugDeckSection.tsx` (add-card picker + deck list + per-entry editor)
- Test: none at unit level for the pure-presentational sections (covered by the App/HUD wiring test in Task 5 and manual browser QA); add a section test only if logic emerges that isn't trivially reading context.

Props: `{ isOpen: boolean; onClose: () => void }`. The component reads `useQuest()` for `state`, `mutations`, `cardDatabase`, and `questContent`. Resolve card/dreamsign **names only at render time**; key everything internally by `cardNumber` / `entryId` / `dreamsign id` (AGENTS.md: never key logic by card name).

- [ ] **Step 1: Build the overlay shell + Resources section in `QuestDebugEditor.tsx`.**

Copy the `DebugScreen.tsx` overlay scaffold (AnimatePresence + `motion.div` full-screen backdrop, header with title "Edit Quest State (debug)" and a × close button, `Escape`-to-close effect, scrollable body). Resources section: numeric `<input type="number">` rows for `essence`, `essenceCap`, `maxDreamsigns`, `completionLevel`, each committing on blur / Enter via the matching mutation (`setEssence`, `setEssenceCap`, `setMaxDreamsigns`, `setCompletionLevel`) with `source: "quest_debug_editor"`. Mirror the label/input styling from `src/editor/TidesDetailView.tsx`.

- [ ] **Step 2: Build the Dreamsigns section in `QuestDebugEditor.tsx`.**

List `state.dreamsigns` with, per row: the resolved name, a bane toggle (`setDreamsignIsBane(index, !isBane, "quest_debug_editor")`), and a remove button (`removeDreamsign(index, "quest_debug_editor")`). An "Add dreamsign" control filters `questContent.dreamsignTemplates` by a text query (match on name and `id`); selecting one calls `addDreamsign({ id, name, effectDescription, imageName, imageAlt, isBane: false }, "quest_debug_editor")`. Disable add when `state.dreamsigns.length >= state.maxDreamsigns` (mirrors `addDreamsign`'s cap no-op) and surface that the cap is reached.

- [ ] **Step 3: Build `QuestDebugDeckSection.tsx`.**

  - **Add card:** a searchable list over `cardDatabase.values()` filtered by query against resolved `name` and `id`; each result has "Add" (`addCard(cardNumber, "quest_debug_editor")`) and "Add as bane" (`addBaneCard(cardNumber, "quest_debug_editor")`). Cap the rendered result rows (e.g. first 50 matches) and show a "refine your search" note when truncated — do not silently drop matches.
  - **Deck list:** one row per `state.deck` entry showing the resolved effective card (use `resolveDeckEntryCard(cardDatabase.get(entry.cardNumber), entry)` for displayed name/cost/spark/subtype). Each row expands to a per-entry editor and has a remove button (`removeCard(entry.entryId, "quest_debug_editor")`).
  - **Per-entry editor controls:**
    - Energy cost + spark: number inputs → `setDeckEntryStatOverride(entryId, { energyCost, spark }, "quest_debug_editor")`; a "reset stats" button passes `null`.
    - Transfiguration: a `<select>` of the nine `TransfigurationType` values plus "none" → `transfigureCard(entryId, type | null, "quest_debug_editor", {})`.
    - Type/subtype: a cardType `<select>` (`Character`/`Event`) + a free-text subtype input → `setDeckEntryTypeChange(entryId, { predicateId: "debug", cardType, subtype, label: "Debug edit" }, "quest_debug_editor")`; a "reset type" button passes `null`.
    - Keywords: a Fast checkbox + a Reclaim number input (blank = none) → `setDeckEntryKeywords(entryId, { fast, setReclaim }, "quest_debug_editor")` (replace semantics); a "clear keywords" button passes `null`.
    - Bane: a checkbox. Toggling re-adds via remove + `addBaneCard`/`addCard` of the same `cardNumber` is **not** acceptable (it loses overrides and changes order). Instead, expose bane only when adding a card; for an existing entry, omit the bane toggle from the per-entry editor (documented limitation) — or, if quick, treat it as out of scope for v1 per the spec's "mark as bane" being satisfied by the add-as-bane path.

  Use the same numeric-commit pattern (blur / Enter) and the `DebugScreen` `StatBadge`/`InfoCard` visual primitives for consistency.

- [ ] **Step 4: Typecheck + lint the new files.** `npm run typecheck && npm run lint`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(quest-editor): add QuestDebugEditor overlay and deck section"`

---

## Task 5: Wire into the HUD menu and `App.tsx`

**Files:**
- Modify: `src/components/HUD.tsx` (props + utility menu)
- Modify: `src/App.tsx` (state, handlers, HUD prop, overlay render)
- Test: `src/components/HUD.test.tsx`

- [ ] **Step 1: Write a failing HUD test in `HUD.test.tsx`.**

Guarantee (catches the menu entry being absent or mis-wired): rendering the HUD with an `onOpenQuestEditor` spy, opening the utility menu (click `hud-utility-menu-button`), and clicking the "Edit Quest State" item (`hud-quest-editor-button`) calls the spy once. Follow the existing menu-interaction tests in this file for the open-menu setup.

- [ ] **Step 2: Run it, verify it fails.** `npm test -- src/components/HUD.test.tsx`

- [ ] **Step 3: Add the HUD prop and menu item.**

In `HUD.tsx`, add `onOpenQuestEditor: () => void` to the props interface (near `onOpenDebugScreen` at line 65) and to the destructured params (near line 86). In the `menuView === "root"` block, add (placement near "Package Debug" is fine):

```tsx
<UtilityMenuButton
  label="Edit Quest State"
  onClick={() => {
    closeUtilityMenu();
    onOpenQuestEditor();
  }}
  testId="hud-quest-editor-button"
/>
```

- [ ] **Step 4: Wire `App.tsx`.** Mirror the `debugScreen` wiring exactly: add `const [questEditorOpen, setQuestEditorOpen] = useState(false);` (near line 64), `handleOpenQuestEditor`/`handleCloseQuestEditor` callbacks (near line 315), pass `onOpenQuestEditor={handleOpenQuestEditor}` to `<HUD>` (near line 417), and render the overlay near the other overlays (line ~468):

```tsx
<ErrorBoundary scope="overlay:quest-editor" onClose={handleCloseQuestEditor}>
  <QuestDebugEditor isOpen={questEditorOpen} onClose={handleCloseQuestEditor} />
</ErrorBoundary>
```

Import `QuestDebugEditor` from `./screens/QuestDebugEditor`. If any other component constructs HUD props (e.g. `HudDreamsignLayoutDemo.tsx`), add a no-op `onOpenQuestEditor`.

- [ ] **Step 5: Run tests + typecheck, verify pass.** `npm test -- src/components/HUD.test.tsx && npm run typecheck`

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(quest-editor): surface QuestDebugEditor in the HUD utility menu"`

---

## Task 6: Full verification + browser QA

**Files:** none (verification only; fix-forward into the relevant task's files if issues surface).

- [ ] **Step 1: Run the full core checks from the worktree root.** `npm run lint && npm run typecheck && npm test`. All green.

- [ ] **Step 2: Browser QA** per AGENTS.md. Start a QA server on a non-default port (`npm run dev -- --port 5174`, capture its PID). Boot into a live quest (e.g. `http://localhost:5174/?startInBattle=1` or a `?goto=` scene that yields a populated deck/dreamsigns). Open the "..." menu, choose "Edit Quest State", and verify: essence/cap/maxDreamsigns/completionLevel edits persist and reflect in the HUD; adding/removing a dreamsign updates the list; adding a card by search and removing a deck entry update the deck; editing a card's energy cost / spark / transfiguration / subtype / keywords shows in the deck viewer and (spot-check) carries into a battle. Inspect the captured error buffer for render errors, unhandled rejections, and console errors. Confirm layout is coherent (no clipping/overlap) at the tested viewport. Tear down by killing only your PID / `pkill -f "vite --port 5174"` (never a broad `pkill -f vite`).

- [ ] **Step 3: Confirm logging.** Trigger several edits, then verify `logs/quest-log.jsonl` contains `quest_debug_edit` entries with `target`/`field`/`before`/`after`/`source` so the session's edits are reconstructable.

- [ ] **Step 4: Final commit + push.** Commit any QA fixes, then `git push` (AGENTS.md: commit with detailed description, then push immediately).

---

## Self-review notes

- **Spec coverage:** resources & caps → Task 3 setters + Task 4 Resources section; dreamsigns add/remove/bane → reused `addDreamsign`/`removeDreamsign` + new `setDreamsignIsBane`, Task 4 Dreamsigns section; deck add/remove → reused `addCard`/`addBaneCard`/`removeCard`, Task 4 deck section; per-card energy/spark → Tasks 1-3 `statOverride` + Task 4 per-entry editor; transfiguration → reused `transfigureCard`; type/subtype → new `setDeckEntryTypeChange`; keywords → new `setDeckEntryKeywords`; logging → Task 3; tests → Tasks 1/2/3/5; unified `resolveDeckEntryCard` → Tasks 1-2.
- **Battle-type mirroring (spec §1):** intentionally dropped — `normalizePlayerDeckCard` reads the real `DeckEntry`, so baking the stat is sufficient and `BattleQuestDeckEntry`/`BattleDeckCardDefinition` need no `statOverride` field. Recorded in Background.
- **Bane-toggle on existing entries:** narrowed to the add-as-bane path for v1 (Task 4 Step 3) to avoid a destructive remove/re-add; flagged as a documented limitation rather than left ambiguous.
- **Tests:** each specified by bug class (wrong-entry write, dropped layer, application order, invariant break, menu wiring); no tuning-value or table-mirror assertions; battle/stat assertions derive expected values from the live DB (printed+offset), resilient to TOML edits.
