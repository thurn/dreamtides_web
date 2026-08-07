# Player-facing grammar audit

This audit covers production React/Cumulus surfaces, their adapters and view
models, accessibility copy, and the Journey content producers that feed those
surfaces. Searches included conditional count tests, plural suffixes, pronoun
and article selection, clause-building template literals, joined fragments,
preformatted view-model strings, accessibility attributes, and English text
transformations.

## Migrated production surfaces

- Deck browsing uses complete Fluent messages for titles, deck counts, filter
  results, empty states, filter and sort controls, and Journey HUD deck and
  Dreamsign counts. The affected code is
  `src/cumulus/screens/MobileDeckViewer.tsx`,
  `src/cumulus/screens/DesktopDeckViewer.tsx`,
  `src/cumulus/screens/mobile-deck-filter.ts`, and
  `src/cumulus/components/hud/JourneyStatusBar.tsx`. Card subtype labels use the
  canonical authored subtype at the display boundary; the UI does not fabricate
  an English plural suffix.
- Battle zone browsing uses semantic owner and zone values plus numeric total
  and filtered counts. Fluent owns the titles, count grammar, owner switches,
  empty states, and accessibility labels in
  `src/cumulus/screens/CardZoneBrowserOverlay.tsx` and
  `src/battle/components/CumulusBattleZoneBrowser.tsx`.
- Exploration uses complete messages for compound reward-and-purge outcomes,
  copy counts, purge rewards, Dreamsign capacity, Dream Avatar changes,
  Transfiguration variants, Spirit Animal gains, future-site and next-battle
  modifiers, empty acquisitions, and relevant choice accessibility in
  `src/cumulus/screens/ExplorationSiteScreen.tsx`.
- Augury offer models carry semantic card, Dreamsign, site, category, copy-count,
  and candidate-count data. Titles and descriptions are formatted at the React
  boundary by `src/cumulus/components/controls/offer-tile-descriptions.ts` and
  `src/cumulus/screens/AugurySiteScreen.tsx`. The adapter
  `src/screens/cumulus_adapters/augury-view-model.ts` carries no formatted offer
  headline or subtitle. Copy and quantity badges receive numeric counts.
- Battle messages use Fluent for phase and participant state, memory and pile
  counts, Figment actions, merge status, Dreamwell values, victory summaries,
  Essence rewards, card-zone and pile accessibility, Foresee and note titles,
  tutorial challenge outcomes, and pool counts. The migrated display code is in
  `src/cumulus/screens/MobileBattleScreen.tsx`,
  `src/cumulus/screens/BattleResultSurface.tsx`, the battle overlay components,
  and the supporting battle status, pile, and Dreamwell components. The mobile
  battle adapter returns semantic score and turn data. Tutorial targeting and
  movement failures cross the controller boundary as semantic states, and
  Figment merge warnings are complete Fluent messages with numeric Spark data.
- The pool browser adapter carries semantic source ids, sort ids, pick numbers,
  selected card names, and structured provenance records. The Cumulus screen
  formats source labels, empty states, replay summaries, locale-aware card-name
  lists, and count-bearing provenance at render time.
- Reusable Cumulus objects use complete accessibility messages for Dreamsigns,
  Tides, character dialogue, Dream Avatar art, Atlas nodes, card ordering,
  Transfiguration choices and badges, and card stat orbs. Wager prize cards and
  Gamble commands and outcome states use complete Fluent messages. The
  Transfiguration and Duplication pickers use semantic ready, enhanced, and
  pending states; narrow Journey-start navigation passes a direction selector.
- Draft progress, Journey-failure summaries, playing-card names, and game-card
  type lines are formatted at their Cumulus display boundaries.
- `src/journey_v2/ui/offerPresentation.ts` contains the semantic visual
  presentation model used by the rendering boundary.

All migrated counts cross the display boundary as numbers. Stable semantic
selectors carry owner, phase, form, state, role, outcome, and action-stage
values. Fluent output is used only for rendering and accessibility; it does not
enter Journey state, battle state, cooperative events, identifiers, logging
dimensions, equality checks, or parsers. Cards continue to use UUID identity.

## Justified exclusions

- `src/battle/debug/**`, `src/debug/**`, `src/editor/**`, Cumulus documentation
  demos, `JourneyDebugEditorScreen.tsx`, `TutorialEditorRail.tsx`, package and
  card-source diagnostics, and battle inspector/context-menu commands are
  developer or editor surfaces. Their English strings cannot appear in the
  normal player workflow.
- `src/battle/components/BattleLogDrawer.tsx` and the battle flow stepping
  controls in `src/battle/components/PlayableBattleScreen.tsx` belong to the
  developer inspector and diagnostic event log.
- `src/screens/cumulus_adapters/card-source-view-model.ts` describes diagnostic
  draft provenance published through the explicitly debug-labeled
  `cardSourceDebug` state and Card Sources developer overlay.
- Count comparisons that select game objects, candidate eligibility, animation
  geometry, arrays, or persisted actions do not produce language. CSS joins,
  SVG paths, stable keys, log text, thrown developer errors, and test fixtures
  are outside player-facing grammar.
- CSS uppercase styling is retained for intentional visual typography. It does
  not slice or mutate localized strings in application code.

## Deferred architecture work

### Exploration authored prose

`data/exploration.toml` stores English action labels, effects, follow-up
titles, and follow-up subtitles. `configuredFollowupCopy()` in
`src/screens/cumulus_adapters/exploration-view-model.ts` substitutes semantic
values into those templates; `appendFixedTransfigurationEffect()` and the
add-site disclosure path append English clauses to `effectText`.
`src/cumulus/screens/ExplorationSiteScreen.tsx` renders the resulting
`followup.title`, `followup.subtitle`, and `action.effectText` values.

This catalog is a mixed content-and-structure interface: effect behavior is
modeled by `effectKind`, while a variable set and free-form English template
define each presentation. A safe migration needs a structured copy descriptor
per effect kind and typed semantic variables at the adapter boundary, followed
by catalog migration. Passing Fluent output into the current substitution or
effect parsing paths would let locale text influence structural behavior. The
complete outcome and accessibility messages that can be derived from existing
semantic state are localized; the authored narrative catalog remains the source
for these follow-up and effect descriptions.

### Augury generated catalog copy

`src/journey_v2/archetypes/grant.ts` and
`src/journey_v2/archetypes/duplicate.ts` populate `copies-word` and
`copies-label`; `src/journey_v2/archetypes/improve.ts` also constructs authored
card/form and subtype-change descriptions. The generator in
`src/journey_v2/encounter/generateMerchantEncounter.ts` expands those fields
through English templates from `data/augury.toml` into persisted
`MerchantOffer` title, summary, prompt, and detail fields. The production
Cumulus Augury adapter derives its display from semantic offer objects and does
not read those formatted fields. They are deterministic catalog/debug data. A
future surface must use the semantic Offer Tile model or a typed message
descriptor rather than displaying these fields. Localizing the stored fields
would mix locale output with replayable Journey data.

### English rules-text and glossary parsing

`src/data/glossary-terms.ts` tokenizes ASCII English rules text, matches English
word forms, evaluates English regular-expression contexts, and renders catalog
templates from `data/glossary.toml`. Card, Dream Avatar, and Dreamsign
rules text is also authored English. The parser's consumers build glossary
reveal cards from those matches. `src/cumulus/internal/reveal/context.tsx` then
assembles hidden accessibility descriptions by joining authored rules,
glossary definitions, Energy-cost lists, and status fragments with English
punctuation and conjunctions. Translating before semantic extraction would
change which game terms are recognized, while translating only the joined
fragments would preserve unsafe English sentence structure. This pipeline needs
structured glossary term references and a semantic reveal-description model,
with locale rendering after term resolution.

## Prevention

`eslint-rules/no-manual-count-copy.js` is enabled for production Cumulus
components, screens, and adapters. It rejects representative singular/plural
ternaries, suffix pluralization, and count-conditioned English copy while
allowing numeric game logic and layout conditions. Developer/editor paths are
explicitly excluded. `eslint-rules/no-manual-count-copy.test.ts` uses synthetic
fixtures to verify accepted semantic/Fluent patterns and rejected regressions.
