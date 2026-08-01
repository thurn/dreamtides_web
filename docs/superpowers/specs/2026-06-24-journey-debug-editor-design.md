# Journey State Debug Editor — Design

**Date:** 2026-06-24
**Status:** Approved, ready for implementation planning
**Worktree:** `.worktrees/journey-debug-editor` (branch `wt/journey-debug-editor`)

## Goal

A debug-mode editor that lets a developer freely reconfigure the live state of a
journey run during play. It is surfaced from the "..." utility menu at the bottom
right of the journey screen (the HUD), opens as a full-screen overlay, and edits
the live multiplayer journey state in place.

At minimum it must support:

- Change essence total (and related caps).
- Add / remove dreamsigns.
- Add / remove cards in the deck.
- Add transfigurations to a deck card.
- Edit a deck card's energy cost.
- Edit a deck card's spark.
- Edit a deck card's character type / subtype.

## Background — relevant existing code

- **Journey state type:** `JourneyState` in `src/types/journey.ts` (essence, essenceCap,
  maxDreamsigns, deck, dreamsigns, completionLevel, dream avatar, resolvedPackage,
  remainingDreamsignPool, ...).
- **Deck entries:** `DeckEntry` in `src/types/journey.ts` holds
  `{ entryId, cardNumber, transfiguration, typeChange?, keywordModification?, isBane }`.
  Base stats (energy cost, spark, subtype) come from `CardData`
  (`src/types/cards.ts`, sourced from `data/tabula/cards.toml`); per-entry
  overrides today are transfiguration, typeChange (cardType + subtype), and
  keywordModification (fast / reclaim).
- **Persistence:** journey state lives in a Firebase RTDB room. All writes go
  through `writeRoomTransaction` / `writeJourneyField` in
  `src/state/multiplayer-journey-context.tsx`. Invariants in
  `src/state/journey-state-invariants.ts` forbid nulling
  `dreamAvatar` / `resolvedPackage` / `draftState` once set
  (`NON_NULLABLE_RUN_FIELDS`).
- **Deck-entry resolution (the chokepoint):** a `DeckEntry` is turned into an
  effective `CardData` by applying transfiguration
  (`applyTransfigurationToCard`, `src/transfiguration/transfiguration-logic.ts`)
  then typeChange + keywords (`applyDeckEntryCardModification`,
  `src/card-type-change.ts`). This sequence is duplicated in:
  - `normalizePlayerDeckCard` in `src/battle/integration/create-battle-init.ts`
    (battle path), and
  - `effectiveCardFor` in `src/journey_v2/archetypes/improve.ts` (journey UI path).
  - `src/components/deck-summary.ts` applies typeChange + keywords only.
- **HUD "..." menu:** `src/components/HUD.tsx` (lines ~390-495); nested menu with
  items like Pool Viewer, Package Debug, Save/Load Journey, Download Log. New items
  are added as `<UtilityMenuButton>` entries.
- **Overlay pattern to mirror:** `src/screens/DebugScreen.tsx` (full-screen
  Framer Motion overlay, Tailwind + inline styles, Escape to close).
- **Form input pattern to mirror:** `src/editor/TidesDetailView.tsx` (label +
  input, commit on blur / Enter).

## Design

### 1. Data model change: per-card stat override

Add an optional override to the deck entry and propagate it into battle:

```ts
// src/types/journey.ts — DeckEntry
statOverride?: { energyCost?: number; spark?: number };
```

Mirror the field on `BattleJourneyDeckEntry` and `BattleDeckCardDefinition`
(`src/battle/types.ts`) and pass it through `createBattleInit`'s deck mapping so
an edited card plays in battle with the overridden stats.

Firebase serialization: omit the field entirely when undefined (conditional
spread), consistent with how `typeChange` / `keywordModification` are written.

### 2. Unified deck-entry resolution helper

Introduce a single helper so override application is defined in exactly one place:

```ts
// resolveDeckEntryCard(card: CardData, entry: DeckEntry): CardData
//   1. apply transfiguration (if entry.transfiguration != null)
//   2. apply typeChange + keywordModification
//   3. apply statOverride LAST — an explicit debug value wins over
//      transfiguration-derived stats (e.g. Empowered halving)
```

Refactor `normalizePlayerDeckCard` (battle init) and `effectiveCardFor`
(`improve.ts`) to call this helper, removing the current duplication.
`deck-summary.ts` retains its current transfiguration behavior but is extended to
apply `statOverride`.

Order rationale: statOverride is an absolute set, applied last so it is
deterministic regardless of which transfiguration/keywords are present.

### 3. Journey-context actions

All mutations go through `writeRoomTransaction` to preserve journey-state
invariants. The editor never exposes nulling `dreamAvatar` / `resolvedPackage` /
`draftState`. Actions (reusing existing ones where present):

- **Resources:** reuse `setEssence`, `changeMaxEssence`; add `setEssenceCap`,
  `setMaxDreamsigns`, `setCompletionLevel`.
- **Dreamsigns:** `addDreamsign(template)`, `removeDreamsign(index)`,
  `setDreamsignIsBane(index, isBane)`.
- **Deck:** `addDeckCard(cardNumber)` (allocates a fresh `entryId`),
  `removeDeckEntry(entryId)`, and a single
  `setDeckEntryOverrides(entryId, partial)` covering `transfiguration`,
  `typeChange`, `keywordModification`, `statOverride`, and `isBane`.

### 4. UI — `JourneyDebugEditor` overlay

A new component, full-screen Framer Motion overlay matching `DebugScreen`
(Tailwind + inline styles, Escape to close), opened from a new
"Edit Journey State (debug)" entry in the HUD "..." menu. Open/close state is
threaded the same way the existing debug screen is wired. Organized into
collapsible sections:

- **Resources:** numeric inputs for essence, essence cap, max dreamsigns, and
  completion level; commit on blur / Enter.
- **Dreamsigns:** the current dreamsign list with a remove button and bane toggle
  per row; an "Add dreamsign" picker searchable over the available dreamsign
  catalog (the resolved package dreamsign pool plus `remainingDreamsignPool`).
- **Deck:** a searchable add-card picker over the entire card database (matched by
  display name and UUID, names resolved at display time); the current deck list,
  each entry expandable to edit energy cost, spark, transfiguration (a dropdown of
  the nine transfiguration types plus "none"), card type + subtype, fast / reclaim
  keywords, bane, and a remove button.

Cards and dreamsigns are always identified internally by UUID / cardNumber; names
are resolved only for display.

### 5. Logging

Per AGENTS.md, every edit emits a `journey_debug_edit` event to
`logs/journey-log.jsonl` capturing `{ gameId, target, field, before, after }` so a
run's manual edits can be reconstructed afterward.

### 6. Testing

Tests must stay resilient to TOML/data changes (no hardcoded card stats or names;
derive fixtures from live data). Coverage:

- `resolveDeckEntryCard` applies `statOverride` last and wins over
  transfiguration-derived stats.
- `statOverride` flows through `normalizePlayerDeckCard` into the battle deck
  definition.
- Deck add / remove and `setDeckEntryOverrides` mutate journey state correctly and
  preserve invariants.
- A UI smoke test that the overlay opens from the "..." menu and renders the
  sections.

## Out of scope

- Editing `dreamAvatar` / `resolvedPackage` / `draftState` structure (invariant
  risk; not requested).
- Editing the underlying card database TOML (edits are per-run, per-entry only).
- Atlas / node-graph topology editing.

## Verification

`npm run lint`, `npm run typecheck`, `npm test` from the worktree root (after
`npm install`), plus browser QA of the overlay per the AGENTS.md QA workflow.
