# Complete Player-Runtime React Localization

**Status:** Approved implementation plan, expanded for autonomous execution

**Catalog:** `data/tabula/strings.ftl`

**Generated contract:** `src/data/localization-messages.ts`

**Primary formatter:** `src/cumulus/hooks/use-messages.ts`

**Scope:** Code-authored player-runtime copy rendered by React, including copy prepared by non-React helpers

**Out of scope:** Authored game-data prose, editor and operator tools, debug/inspector UI, image viewer, Cumulus documentation and demos, QA fixtures, tests, locale selection, and additional locale files

## Outcome

Every player-visible utterance authored in TypeScript or TSX on the normal
Dreamtides runtime path comes from `data/tabula/strings.ftl`. This includes
visible text, accessible names and descriptions, errors, connection states,
empty states, placeholders, tooltips, and copy assembled in view-model or rules
code before React receives it.

The runtime transports semantic values or typed Fluent message descriptors.
Formatted text exists only at a React presentation boundary. Journey state,
the cooperative event log, battle state, prompt resolution, analytics, and test
selectors stay locale-neutral and deterministic.

This project phase centralizes the existing English source and makes the player
runtime translation-ready. It does not add a locale picker, locale persistence,
translated catalogs, or deployment changes.

## Start Here for an Implementing Agent

1. Read this document, `AGENTS.md`, `.llms/skills/localization/SKILL.md`,
   `docs/journey_prototype/localization.md`, and
   `docs/journey_prototype/localization-grammar-audit.md` before editing.
2. Use the repository-required `wt` worktree workflow. Run `npm install`, then
   `scripts/regenerate-assets.sh` once in the fresh worktree as required by the
   repository workflow.
3. Implement Task 1 and Task 2 first. They define the inventory boundary and
   typed contract used by every later task.
4. Tasks 3 through 8 may be assigned independently after Task 2. Task 9 depends
   on Task 2; Task 10 depends on Task 9. Task 11 follows all migration tasks.
   Task 12 is the integration and acceptance pass.
5. For every task, add catalog messages and translator descriptions in the same
   change as the code that consumes them. Run the named focused tests before
   handing the task back.
6. Do not use English UI strings as test expectations or selectors. Use roles,
   state attributes, semantic IDs, event payloads, and formatter diagnostics.
7. Commit each coherent task with a detailed commit message and push it
   immediately. Run the single independent review only after the integrated
   implementation is complete.

## Existing Localization Architecture

### Runtime catalog and formatting

- `src/data/localization.ts` creates a single `en-US` Fluent bundle from
  `data/tabula/strings.ftl` and exposes it through the application localization
  provider.
- `scripts/generate-localization-types.mjs` parses each Fluent message and its
  variable references. It generates `FLUENT_MESSAGE_IDS`,
  `FluentMessageArgumentsById`, `FluentMessageId`, and
  `FluentMessageArguments<Id>` in
  `src/data/localization-messages.ts`.
- `src/cumulus/hooks/use-messages.ts` exposes a typed `MessageFormatter`. React
  code calls `t(messageId, variables)` through this hook.
- `src/localization.test.ts` verifies that every generated ID is present and
  exercises representative count and semantic selectors without treating
  English output as a stable contract.

At the time of this audit, `strings.ftl` contains roughly 1,500 lines and the
generated localization module roughly 770 lines. Existing sections already
cover deck and pool browsing, exploration outcomes, battle result grammar,
entity accessibility, Augury and Gamble, Dream Avatar and Atlas accessibility,
Journey failure, and several battle controls. Reuse these messages and private
terms when the meaning is identical; create a distinct message when placement,
actor, consequence, or grammar differs.

### Player-runtime ownership boundary

`src/main.tsx` is the authoritative route split. The default application branch
mounts the player runtime. Explicit editor, debug, image-viewer, event-log, and
`/cumulus` routes are outside this migration.

`eslint-rules/ui-boundary-roles.js` is the authoritative ownership inventory for
React outside `src/cumulus/`. It classifies application shells, state adapters,
operator tools, devtools, and emergency fallbacks. The localization rule should
reuse this inventory instead of maintaining a competing list.

Include:

- `src/App.tsx`, `src/main.tsx`, player app shells, and normal screen routing.
- `src/coop/` except `EventLogViewer.tsx` and synthetic probes.
- Player-facing files classified as `APP_SHELL`, `STATE_ADAPTER`, or
  `EMERGENCY_FALLBACK` in `ui-boundary-roles.js`.
- `src/cumulus/components/`, `src/cumulus/screens/`, and
  `src/screens/cumulus_adapters/`, subject to the exclusions below.
- Non-React rules and view-model files that construct copy specifically for an
  included React surface, notably battle effects, Exploration presentation,
  deck controls, Dreamscape labels, and Transfiguration offers.

Exclude:

- `src/editor/`, `src/debug/`, `src/image_viewer/`,
  `src/cumulus/docs/`, `src/cumulus/screens/devtools/`, and files classified as
  `OPERATOR_TOOL` or `DEVTOOL`.
- `JourneyDebugEditorScreen.tsx`, `TutorialEditorRail.tsx`, battle inspector and
  context-menu commands, figment-creator developer controls, QA-scene metadata,
  test fixtures, snapshots, and test files.
- Authored prose and vocabulary loaded from RON, JSON, card rules, tutorial
  configuration, glossary data, or similar catalogs. Card names, Dreamsign
  names, guide names, site blurbs, rules text, and glossary definitions remain
  opaque values at this boundary.

### Text classification rules

Treat a string as a translation unit when it supplies player-visible grammar or
meaning: headings, labels, help text, status, action text, validation, errors,
notifications, accessible copy, image descriptions, or connective language
around a variable.

Treat these as locale-neutral technical values:

- UUIDs, room IDs, hashes, reducer versions, configuration IDs, event kinds,
  data attributes, test IDs, route names, CSS classes and values, icon names,
  file paths, log event names, and developer exception messages.
- Raw exception detail displayed in a dedicated technical-detail region. The
  surrounding title, explanation, and action labels are Fluent messages.
- Opaque authored-data strings passed through from a typed data source. React
  may interpolate them into a complete Fluent message but must not parse them or
  append English grammar to them.

## Research Findings: Remaining High-Confidence Inventory

The inventory below identifies concrete seams found in the current tree. The
lint pass in Task 1 remains the completion authority because literal searches
produce both false positives and developer-only results.

### Bootstrap, errors, and cooperative play

- `src/cumulus/screens/ApplicationStateScreen.tsx` accepts preformatted
  `title`, `message`, `detail`, `busyLabel`, comparison-row `label`, and action
  `label` strings. Its eyebrow map and comparison headings (`This Game`,
  `Yours`) are also English literals.
- `src/App.tsx` constructs the player loading, saved-journey failure, content
  failure, Firebase configuration, and game-service connection states. The QA
  scene loading branch is developer-only; saved-journey and production
  bootstrap states are in scope.
- `src/coop/RoomGate.tsx` constructs joining, creating, room-not-found, and room
  setup failure screens, including actions and room-ID sentences.
- `src/coop/ConfigGateScreen.tsx` constructs the settings mismatch screen and
  comparison rows for pool, draft, pack size, Atlas, site, draft, economy,
  opponent, and tutorial rules. Known fallback values such as default and
  unavailable are player copy; raw configuration IDs are variables.
- `src/coop/VersionGateScreen.tsx` and
  `src/coop/UnreadableRoomScreen.tsx` construct compatibility and unreadable-room
  copy.
- `src/components/ErrorBoundary.tsx` is a class boundary containing its own
  heading, explanation, and retry/close controls. Keep the boundary class and
  render a hook-capable localized fallback child.
- `src/coop/BounceToast.tsx` maps bounce causes to complete English sentences.
  `src/coop/HostedPlaytestShell.tsx` contains disconnected-player and take-control
  copy. `src/cumulus/components/hud/CoopPresenceStatus.tsx` constructs connecting
  and connected-count status.

### Front door, Journey chrome, and shared controls

- `src/screens/cumulus_adapters/main-menu-view-model.ts` embeds the product
  title, five menu labels, and three social labels. IDs and ordering are already
  stable and should become the model contract.
- `src/cumulus/screens/MainMenuScreen.tsx` owns the navigation and community
  accessible group names.
- `src/cumulus/screens/LoadingScreen.tsx` and its adapter contain card anatomy,
  begin, and loading labels. Authored tutorial dialogue remains opaque.
- `JourneyStartScreen`, `JourneyStatusBar`, `TidesInfoLabel`, `CommandMenu`,
  `TutorialFeatureCallout`, and `ViewportTutorialDialogue` retain visible or
  accessible English defaults.
- Reusable entity copy remains in `CardChoiceGrid`, `RulesText`, `CardView`,
  `BattleStatusDisplay`, `AtlasNode`, and
  `src/cumulus/components/card/glossary-info-card.ts`. These include card-change
  states, rule-symbol names, portrait loading, Atlas metadata, and fallback rule
  definitions.

### Deck, Dreamscape, and sites

- `src/cumulus/screens/mobile-deck-filter.ts` and
  `desktop-deck-filter.ts` embed type, sort, size, direction, and all-subtypes
  labels in option objects. Keep stable option values and authored subtype names;
  format the labels in the React screen.
- `DesktopDeckViewer`, `MobileDeckViewer`, and
  `CardZoneBrowserOverlay` retain headings, empty states, zone labels, search
  placeholder, filter/sort labels, and sort-direction accessible text.
- `src/screens/cumulus_adapters/dreamscape-view-model.ts` constructs `Battle`,
  `Final Boss`, and `Draft {count}x`. It otherwise consumes authored site names
  and blurbs. `SiteNode.tsx` constructs guardian lock guidance.
- Remaining site copy is concentrated in `BattleStartScreen`,
  `CardShopSiteScreen`, Dreamsign Bazaar/Revelation/Replacement screens,
  Draft, Purge, Random Site, Starting Deck, Augury, Exploration, Duplication,
  and Transfiguration. Several of these are partially localized; migrate only
  literals and preformatted model fields that remain.
- `src/screens/cumulus_adapters/exploration-view-model.ts` preserves authored
  `action.label` and `action.effectText`, but appends code-authored English for
  fixed Transfiguration explanations, an offered site type, special-variable
  fallbacks, and the generic resolved effect. Those clauses require semantic
  fields and Fluent rendering. The base authored action prose remains untouched.

### Reveal accessibility

`src/cumulus/internal/reveal/context.tsx` creates hidden descriptions by joining
English fragments. It constructs definition sentences, Tide alignment, Energy
alternatives joined with `and`, Spark, Fast, Interrupt, Reclaim, and punctuation
between card traits and authored rules text. The reveal model should carry
semantic variants; one display formatter should create a complete description
for each entity kind.

### Transfiguration

`src/transfiguration/transfiguration-logic.ts` defines
`TransfigurationOffer.description: string`. `buildOffer()` constructs English
for Energy and Spark deltas, added Draw/Reclaim/Fast abilities, quoted changed
rules text, widened triggers, reduced activated cost, and Perfected. The module
also exposes `describeTransfiguration()` as a formatted string API.

`TransfigurationButton` consumes the description and exposes it through visible
and accessible presentation. `TransfigurationSiteScreen` has localized flow
copy but still carries literal `Transfigure` and `Reforging…` action models.
Eligibility, preview construction, and committed card mutation are rules and
must remain unchanged.

### Battle prompt persistence and presentation

- `src/rules/battle/effect-step.ts` defines `EffectPrompt` with string `label`,
  optional `subtitle`, and string option labels.
- `src/rules/battle/effect-runner-core.ts` copies those strings into
  `ActivePrompt`. A confirm prompt is converted to choice options labeled
  `Yes` and `Skip`.
- `src/rules/battle/fold.ts` stores `ActivePrompt` in `PendingPrompt`, which is
  part of folded and JSON-serializable battle state.
- `src/rules/journey/lifecycle.ts` validates `LOAD_STATE` battle payloads. Its
  `asValidBattleFoldState`, `isValidPendingPrompt`, and `isActivePromptShape`
  functions currently require the legacy string shape. This is the load-time
  compatibility seam.
- `src/battle/components/PlayableBattleScreen.tsx` and the mobile battle
  view-model forward prompt strings to `MobileBattleScreen`.
- `src/battle/components/battle-prompt-logging.ts` logs `promptLabel`; choice
  handling also logs `optionLabel`. Logging should retain a stable message ID
  and semantic arguments, not rendered text.

Production prompt meanings found in the effect tables are:

- Discover a card costing at most 2 Energy; discover a character; rematerialize
  an ally; choose a void card to gain temporary Reclaim, with explanatory
  subtitle.
- Choose or discard one card; confirm discarding two then drawing two, followed
  by a two-card picker; return any void card; return an Event from the void;
  banish an opposing character; choose one card for hand.
- Confirm putting a void card on top of the deck, followed by its picker;
  confirm abandoning a character to draw two, followed by its picker.
- Choose between drawing a card and gaining two Energy; confirm discarding the
  hand and redrawing; confirm playing a character from the void, followed by its
  picker.
- The production card-effect table also creates a discover-character prompt.
  Fixture-only confirmation prompts in that table are excluded.
- Foresee has semantic count and card IDs and needs localized overlay copy, but
  its persisted prompt already contains no label string.

### Remaining normal battle UI

Player-facing copy remains in the card-note editor, Foresee overlay, deck-order
picker, Dreamwell history drawer, zone browser, choice/picker validation, empty
zones, and some normal board controls. The large `MobileBattleScreen.tsx` file
also contains inspector and debug commands; use the render path reached from
`PlayableBattleScreen` and the ownership comments to distinguish normal player
copy. Battle context menus, the inspector, debug fills, and figment-creator
developer controls are excluded.

## Target Contracts and Invariants

### Typed message descriptors

Extend the generator so the generated module exposes a discriminated descriptor
union. The exact generated syntax may vary, but it must express this contract:

```ts
type FluentMessageDescriptor =
  | { readonly id: MessageWithoutVariables }
  | { readonly id: MessageWithVariables; readonly variables: ExactVariables };
```

Requirements:

- An unknown ID is a compile error.
- A descriptor for a message with variables requires exactly the generated
  variable fields. A descriptor for a message without variables does not need a
  variables property.
- Values transported in persisted descriptors are JSON-safe semantic scalars,
  using strings for selector enums and numbers for numeric selectors. Dates,
  React nodes, functions, Fluent objects, and formatted strings are invalid.
- Export one descriptor formatter adjacent to `useMessages()`. Callers should
  use direct `t(id, variables)` when no descriptor crosses a non-React boundary.
- Add a runtime structural guard for untrusted persisted descriptors. It must
  verify the ID against `FLUENT_MESSAGE_IDS`, require an object for variables
  when the message contract has variables, and accept only JSON-safe scalar
  values. The formatter must have a generic localized fallback path for invalid
  legacy data; raw IDs must never appear in the player UI.

### State and view-model boundaries

- A React screen selects messages from semantic state whenever practical.
- A non-React controller may pass `FluentMessageDescriptor` when it must choose
  the complete utterance before the display boundary.
- Authored names and prose remain raw values and may be variables in a complete
  message.
- Technical detail is a distinct field and DOM region. It is not concatenated
  into a translated sentence.
- Semantic IDs, UUIDs, counts, option indices, and enum values remain the source
  of behavior, logging, equality, and selection.

### Fluent authoring

Every new message or cohesive message group needs a translator description
immediately above it. State:

- where the copy appears and whether it is visible or accessibility-only;
- the actor, object, tense or mood, and player consequence;
- every variable's meaning, type, finite domain, and whether zero is valid;
- whether an inserted string is an opaque card name, rules text, site name,
  technical identifier, or error detail;
- genuine space, truncation, or screen-reader constraints.

Use complete sentences or complete UI units. Keep articles, punctuation,
conjunctions, plural behavior, and state-dependent wording inside Fluent. Use
numeric selectors for counts and semantic selectors for owner, state, outcome,
direction, form, and presence. Do not create messages that exist only to supply
an English suffix or punctuation fragment.

## Detailed Execution Tasks

### Task 1: Make the inventory reproducible and define the lint boundary

**Objective:** Turn the audit boundary into an executable, tested definition
before the migrations spread across the tree.

**Files to inspect or change:**

- `eslint-rules/ui-boundary-roles.js`
- `eslint-rules/no-manual-count-copy.js` and its test
- new localization lint rule and test under `eslint-rules/`
- `eslint.config.js`
- `docs/journey_prototype/localization-grammar-audit.md`

**Implementation:**

1. Create a rule such as `no-unlocalized-player-copy`. Reuse
   `outerUiRole()` for outer React files and define the included Cumulus and
   adapter prefixes in one exported scope helper.
2. Reject static English JSX text and static strings supplied to copy-bearing
   JSX props, including `label`, `title`, `subtitle`, `message`, `description`,
   `detail`, `placeholder`, `alt`, `emptyLabel`, `busyLabel`, `aria-label`, and
   tooltip/help equivalents.
3. Reject static English template quasis and copy-shaped object properties in
   player presentation builders. Cover `label`, `title`, `subtitle`, `message`,
   `description`, `detail`, `busyLabel`, `effectText`, and option-label arrays.
4. Permit short machine tokens, data/test/ARIA state attributes, CSS, icons,
   routes, log event names, thrown developer errors, and values obtained from
   authored-data variables. Prefer syntactic certainty over guessing; ambiguous
   literals should require a narrow inline suppression with a reason.
5. Keep rule tests synthetic. Include rejected JSX text, copy props, template
   literals, nested option objects, and view-model fields; include accepted
   `useMessages()` calls, descriptors, UUIDs, data attributes, CSS, logs,
   developer errors, and authored variables.
6. Build and test the rule at the start, then enable it as an error after Tasks
   3–10 have cleared the included scope. Do not add a baseline or a directory
   allowlist for player code.
7. Update the grammar audit with the exact runtime boundary, authored RON/data
   exclusions, and enforcement command. Remove stale TOML terminology where it
   describes catalogs that are RON in the current tree.

**Focused verification:** run the new rule test, the existing manual-count rule
test, and ESLint against representative included and excluded files.

**Done when:** the rule can be enabled with zero player-runtime findings and a
new literal in any protected shape fails a synthetic test or lint run.

### Task 2: Generate and format typed message descriptors

**Objective:** Provide the locale-neutral copy transport needed by application
state and persisted battle prompts.

**Files to change:**

- `scripts/generate-localization-types.mjs`
- generator tests, creating one if the generator currently lacks direct tests
- generated `src/data/localization-messages.ts`
- `src/cumulus/hooks/use-messages.ts`
- `src/localization.test.ts`

**Implementation:**

1. Extend the generator with `FluentMessageDescriptor` and the metadata needed
   by its runtime guard. Derive both from the parsed catalog; do not maintain a
   second hand-written ID list.
2. Add `formatMessageDescriptor(t, descriptor)` or an equivalent typed helper.
   Keep `useMessages()` as the direct formatter API.
3. Add compile-time assertions for: a valid message without variables, a valid
   variable-bearing message, unknown ID rejection, missing variables rejection,
   and misspelled variable rejection.
4. Add runtime guard tests for valid JSON round trips, unknown IDs, wrong
   variable containers, and non-scalar values. Test fallback behavior by
   asserting non-empty output and absence of the raw ID, not English wording.
5. Run `npm run localization-types` and verify the generated file is clean on a
   second run.

**Done when:** application and battle code can carry a descriptor without
importing Fluent runtime objects, and only React display code formats it.

### Task 3: Localize application state, bootstrap, and cooperative status

**Depends on:** Task 2.

**Primary files:**

- `src/cumulus/screens/ApplicationStateScreen.tsx` and test
- `src/App.tsx` and `src/App.test.tsx`
- `src/coop/RoomGate.tsx`, `ConfigGateScreen.tsx`,
  `VersionGateScreen.tsx`, `UnreadableRoomScreen.tsx`
- corresponding coop tests, including `RoomGate.test.tsx` and retry tests
- `src/components/ErrorBoundary.tsx` and its tests
- `src/coop/BounceToast.tsx`, `HostedPlaytestShell.tsx`, and tests
- `src/cumulus/components/hud/CoopPresenceStatus.tsx`

**Implementation:**

1. Change application-state presentation fields to descriptors or semantic
   values. The screen should own eyebrow selection and comparison-column
   headings. Comparison row kinds should be stable IDs; expected/actual raw
   configuration identifiers remain values.
2. Add messages for production loading, saved journey, content loading/failure,
   Firebase setup, service connection, room creation/join, room not found, room
   setup failure, version mismatch, content-configuration mismatch, unreadable
   room, and unreachable room. Keep room IDs and diagnostics as variables or
   technical-detail fields.
3. Represent application actions by stable action IDs and callbacks. Select
   Retry, Copy Details, Create New Game, Try Again, use-settings, and new-game
   copy in Fluent.
4. Add semantic config-row and config-value messages. Known enum display names
   and unavailable/default states are messages; opaque hashes and configuration
   IDs stay raw.
5. Move ErrorBoundary presentation into a localized function component used by
   the class boundary. Preserve retry/reset behavior and error capture.
6. Replace the BounceToast string switch with cause-to-descriptor mapping.
   Include partner conflict, stale game, invalid action, send failure, dropped
   pending intent, active-choice gate, remote control, and internal failure.
7. Localize hosted-playtest disconnection and control transfer. Localize
   presence as loading/connecting or a count selector that explicitly supports
   0, 1, and 2+ clients.

**Tests:** cover every `ApplicationStateView.kind`, each stable action ID, each
bounce cause, presence counts 0/1/2, and hosted-control states through roles and
semantic state attributes. Replace existing English selectors in affected tests.

**Done when:** controllers choose state and raw values, presentation chooses all
grammar, and raw technical details never share a concatenated sentence with
translated copy.

### Task 4: Localize main menu, loading, Journey start, and shared chrome

**Depends on:** Task 2.

**Primary files:**

- `src/screens/cumulus_adapters/main-menu-view-model.ts` and test
- `src/cumulus/screens/MainMenuScreen.tsx` and test
- `LoadingScreen.tsx`, `LoadingScreenAdapter.tsx`, and tests
- `JourneyStartScreen.tsx`, its adapter, and tests
- `JourneyStatusBar`, `TidesInfoLabel`, `CommandMenu`,
  `TutorialFeatureCallout`, and `ViewportTutorialDialogue`
- associated component tests

**Implementation:**

1. Keep main-menu action/social IDs and ordering in the view model. Remove label
   and title fields that merely duplicate static catalog copy. The screen maps
   `new-journey`, `dream-codex`, `settings`, `about`, and `quit` to messages.
2. Localize the product title, main navigation landmark, community group, and
   social accessible names. Brand names may remain proper-name variables only
   when they come from an authored or external source.
3. Localize Loading card-anatomy labels, Begin/loading controls, Dream Avatar
   selection title/actions/carousel names, and Journey HUD labels. Preserve
   authored Dream Avatar names, descriptions, tide names where already provided
   by data, and tutorial dialogue.
4. Localize shared Back/no-actions command-menu states, Tides information,
   tutorial feature names, and the battle/card/site tutorial viewport labels.
5. Retain stable data attributes for every action so tests and QA do not depend
   on English.

**Tests:** main-menu action order and callbacks by ID; loading and Journey-start
state branches; command-menu empty/non-empty branches; tutorial-callout semantic
kinds; accessible regions present and non-empty.

**Done when:** these surfaces accept semantic IDs and authored entity values,
with no static player copy in their adapters.

### Task 5: Localize deck controls, zone browsing, and Dreamscape labels

**Depends on:** Task 2.

**Primary files:**

- `src/cumulus/screens/mobile-deck-filter.ts`
- `src/cumulus/screens/desktop-deck-filter.ts`
- `MobileDeckViewer.tsx`, `DesktopDeckViewer.tsx`, and tests
- `CardZoneBrowserOverlay.tsx` and its callers/tests
- `src/screens/cumulus_adapters/dreamscape-view-model.ts` and test
- `DreamscapeScreen.tsx`, `SiteNode.tsx`, and tests

**Implementation:**

1. Make deck control option types carry only semantic `value` plus an optional
   authored subtype value. Format All/Character/Event, Name/Acquired/Cost/Spark/
   Subtype, All Subtypes, direction, and S/M/L accessible names in React.
2. Keep comparator behavior, subtype discovery, filter values, and acquisition
   order unchanged. Authored card names and subtypes stay opaque and remain the
   comparison/display inputs they already are.
3. Localize deck titles, card counts, Avatar/Dreamsign/Tides groups, empty deck,
   sort/filter accessible names, and zone-browser search, placeholder, type,
   sort, current-order, and empty states.
4. Change Dreamscape models from preformatted `label: string` for generated
   cases to a discriminated semantic label: battle with final-boss boolean,
   Draft with pick count, or authored site name. Format only the first two.
5. Localize unrevealed fallback names, guardian lock guidance, found/gained
   Dreamsign outcomes, and keep-current action. Preserve authored site names,
   blurbs, and Dreamsign names.

**Tests:** filter and sort behavior by semantic values; each option domain;
subtype passthrough; Draft count 0/1/2 if zero is structurally valid, otherwise
document the positive domain; final-boss and ordinary battle labels; locked and
unlocked site states. Use IDs and data attributes, not labels.

**Done when:** pure sorting and placement modules contain only semantic option
values and authored-data passthrough, and all generated Dreamscape grammar is in
Fluent.

### Task 6: Localize remaining site flows and Exploration clauses

**Depends on:** Task 2. Can be divided by site family if each assignee owns its
catalog block and avoids overlapping `strings.ftl` edits.

**Primary files:**

- `BattleStartScreen.tsx` and adapter
- Card Shop, Draft, Dreamsign Bazaar, Dreamsign Revelation, Dreamsign
  Replacement, Purge, Random Site, Starting Deck, Augury, Duplication,
  Transfiguration, and Exploration screens/adapters
- `src/screens/cumulus_adapters/exploration-view-model.ts`
- their focused screen and adapter tests

**Implementation:**

1. Audit each screen by state: initial, loading, selectable, invalid/empty,
   confirming, resolved, declined, and leaving. Migrate remaining headings,
   actions, validation, transient outcomes, empty states, accessible groups, and
   image/loading descriptions.
2. For Battle Start, cover opponent preview, ability state, signature cards,
   Dreamsigns, win condition, reward, and begin action. Opponent, ability,
   Dreamsign, and card content from data stays opaque.
3. For Shop and Dreamsign flows, cover restock/free states, full collection,
   replacement, revealing/exhausted, decline/cancel, and leave actions with
   selectors for enhanced, cost, availability, and collection count.
4. For Augury, cover decline/walk/reroll/choose-again/confirm and adapter failure
   states. Persisted offer debug copy that is not rendered by production React
   remains outside scope.
5. For Exploration, retain authored `action.label`, base `action.effectText`,
   narrative, and choices as opaque content. Replace these code-authored clauses
   with semantic presentation fields:
   - fixed Transfiguration kind and its semantic change;
   - offered site type disclosure;
   - `$DECK_CARD` missing-target fallback;
   - resolved-effect generic fallback.
6. Render code-authored disclosures as their own complete Fluent units adjacent
   to the authored effect. Do not splice localized text into the authored string
   or use English parentheses/sentence suffixes in the adapter.
7. Preserve Exploration effect-part entity reveal behavior. Card and Dreamsign
   references continue to use UUID-backed entities; card names are resolved only
   for display.

**Tests:** one structural test for every state branch and selector domain;
Exploration tests proving authored text is passed through unchanged while each
semantic disclosure kind is present; no English assertions. Retain mutation and
logging expectations unchanged.

**Done when:** all code-authored site grammar is Fluent and all RON-authored prose
remains an opaque value.

### Task 7: Localize reusable accessibility and reveal descriptions

**Depends on:** Task 2.

**Primary files:**

- `CardChoiceGrid`, `CardView`, `RulesText`, `BattleStatusDisplay`, `AtlasNode`
- `TutorialFeatureCallout` if not completed in Task 4
- `src/cumulus/components/card/glossary-info-card.ts`
- `src/cumulus/internal/reveal/context.tsx` and reveal model files
- `context.test.tsx`, `RevealOverlay.test.tsx`, `GameCardReveal.test.tsx`, and
  focused component tests

**Implementation:**

1. Localize card-change states (purged, copied, transfigured, changed), Fast and
   Interrupt state, rule-symbol names, HUD and portrait loading descriptions,
   Atlas role/state metadata, and glossary unavailable fallbacks.
2. Replace reveal string assembly with semantic description variants for info
   cards, definition groups, Tide discs, and game cards.
3. For card reveal, pass optional Energy alternatives, Spark, Fast, Interrupt,
   Reclaim count, and authored rules text into a complete message. Select on
   presence/state; do not build a list using English `and` or join fragments with
   `. ` in TypeScript.
4. Treat titles, glossary terms/definitions, card names, and rules text as opaque
   variables. If Fluent cannot safely render rich entity nodes in the hidden
   description, keep the accessibility description plain text and retain the
   existing interactive reveal surface separately.
5. Ensure a missing glossary definition uses localized fallback copy without
   exposing a raw key.

**Tests:** every reveal entity kind; card traits individually and in combination;
Energy alternatives of one and multiple costs; Reclaim 0/1/2 where valid;
missing definition; accessible-description association; no formatter
diagnostics or raw message IDs.

**Done when:** the hidden description coordinator contains semantic branching
but no English punctuation, conjunction, or sentence construction.

### Task 8: Make Transfiguration offers semantic

**Depends on:** Task 2.

**Primary files:**

- `src/transfiguration/transfiguration-logic.ts` and test
- `src/cumulus/components/controls/TransfigurationButton.tsx` and test
- `src/cumulus/screens/TransfigurationSiteScreen.tsx` and test
- `src/screens/cumulus_adapters/TransfigurationSiteScreenAdapter.tsx`
- Exploration integration points that display a Transfiguration summary

**Implementation:**

1. Replace `TransfigurationOffer.description` with a discriminated semantic
   change value. Variants must cover Energy delta, Spark delta, added Draw,
   Reclaim, Fast, amplified rules text, widened trigger, activated-cost
   reduction, and all-available changes.
2. Keep `type` and `previewCard`. Compute delta values from original and preview
   cards without formatting them. Keep `transfigurationEffectDetails()` as the
   logging/analysis contract and update it only if the new semantic type can
   remove duplicated calculation safely.
3. Replace `describeTransfiguration(): string` with a semantic description API,
   or remove its formatted-string responsibility after updating every caller.
4. Format canonical form names and complete change descriptions in React.
   Insert amplified authored rules text as an opaque variable; Fluent owns quote
   marks and punctuation.
5. Replace literal `Transfigure` and pending `Reforging…` models with localized
   ready/pending action states.
6. Preserve eligibility checks, canonical offer order, random selection,
   preview-card content, essence cost, confirmation, and committed mutation.

**Tests:** every `TransfigurationType`, including ineligible cases and Perfected;
semantic from/to values; preview equivalence; visible and accessible descriptor
formatting without English assertions; site ready/pending branches.

**Done when:** rules code returns structured changes and React is the only layer
that formats their presentation.

### Task 9: Convert battle prompt rules and persisted state to descriptors

**Depends on:** Task 2. Complete before Task 10.

**Primary files:**

- `src/rules/battle/effect-step.ts`
- `src/rules/battle/effect-runner-core.ts` and test
- `src/rules/battle/fold.ts`
- `src/rules/battle/dreamwell-effects-table.ts` and test
- `src/rules/battle/battle-card-effects-table.ts` and production tests
- `src/rules/journey/lifecycle.ts` and test
- battle driver, replay, reducer, and lifecycle fixtures that construct prompts

**Implementation:**

1. Change `EffectPrompt` so picker title, optional subtitle, confirmation title,
   choice title, and choice options are `FluentMessageDescriptor` values. Keep
   candidates, count, optional, highlight, resolve/build callbacks, and step
   ordering unchanged.
2. Change `ActivePrompt` to the JSON-safe descriptor shape. Confirm still
   materializes as a two-option `choice`, but its affirmative and skip options
   use descriptors. Foresee remains count/card IDs.
3. Add complete catalog messages for every production prompt meaning listed in
   the research inventory. Use numeric variables where the same prompt meaning
   can vary by count. Give subtitle/explanation its own complete message only
   because it occupies a distinct subtitle placement.
4. Keep prompt kind, candidate UUIDs, required count, optional flag, option
   order, option index, highlight IDs, run cursor, and resolution edits exactly
   stable. Add before/after semantic snapshots in tests if needed to prove this.
5. Add a load-time normalization function at `asValidBattleFoldState()` before
   the descriptor-aware shape guard. For a legacy `label`/`subtitle` prompt:
   - identify the built-in prompt from `run.scriptRef`, cursor, prompt kind, and
     known effect definition when possible;
   - use a finite legacy-label table only as a compatibility fallback;
   - preserve candidates, counts, option count/order, option indices, and run;
   - map known `Yes`/`Skip` option positions to their semantic descriptors;
   - map an unrecognized legacy title or option to a generic localized prompt or
     generic option descriptor without changing its resolution index.
6. Validate normalized descriptors against generated message IDs and JSON-safe
   variables. Malformed structural prompt data still bounces as before.
7. Do not write formatted prompt text into the event log. New rooms derive the
   same descriptors by folding the same effect script, independent of locale.

**Tests:**

- Compile-time prompt construction for every prompt kind.
- Effect-runner tests proving the active descriptor, candidates, highlight IDs,
  option order, and resolution behavior.
- JSON round trip of each active prompt kind.
- `LOAD_STATE` normalization for known picker, subtitle, choice, confirm, and
  unknown legacy labels; malformed prompt rejection remains covered.
- Replay/cooperative fold tests proving identical candidates, prompt IDs,
  cursors, option indices, and resulting edits.
- Production prompt inventory test that walks effect tables or uses stable
  synthetic definitions and verifies every descriptor ID exists in the bundle.

**Done when:** `PendingPrompt` contains only descriptors and semantic data, and a
legacy saved battle can load without persisting English into the new shape.

### Task 10: Format battle prompts and localize normal battle overlays

**Depends on:** Task 9.

**Primary files:**

- `src/battle/components/PlayableBattleScreen.tsx`
- mobile battle view-model and `src/cumulus/screens/MobileBattleScreen.tsx`
- `src/battle/components/battle-prompt-logging.ts` and test
- `BattleCardNoteEditor.tsx`, `BattleDeckOrderPicker.tsx`,
  `BattleDreamwellHistoryDrawer.tsx`, `CumulusBattleForeseeOverlay.tsx`, and
  `CumulusBattleZoneBrowser.tsx`
- `BattleForeseeOverlay.tsx`, `CardZoneBrowserOverlay.tsx`, and focused tests

**Implementation:**

1. Format prompt descriptors when building the visible picker or choice model.
   Prefer passing descriptors through the mobile view model and formatting in
   `MobileBattleScreen`; if an adapter must format, keep the value presentation-
   only and prevent it from flowing back into battle actions or logs.
2. Use stable semantic attributes for prompt kind, descriptor ID, option index,
   required count, and optional state. Interactions resolve by candidate UUID or
   option index only.
3. Change prompt logging to record descriptor ID and semantic arguments.
   Preserve Dreamwell card UUID, prompt ID/kind, side, candidate instance IDs,
   backing card UUIDs, required count, optional flag, option index, and run
   script reference. Remove formatted labels from reconstruction fields.
4. Localize Foresee source, deck/void destinations, count controls, confirmation,
   and accessible ordering instructions. Preserve ordered/voided card IDs.
5. Localize deck-order titles and owner selectors, note title/placeholder/error/
   expiry options/turn count/actions, Dreamwell history title/empty state, zone
   controls, prompt validation, and normal empty-zone copy.
6. In `MobileBattleScreen.tsx`, migrate only the player path reached through
   `PlayableBattleScreen`. Leave inspector, context menu, debug deck filling,
   figment creator, and operator commands outside the localization rule scope.

**Tests:** picker/choice render by descriptor ID; option resolution by index;
prompt logs contain IDs/arguments and omit formatted labels; note expiry states;
Foresee and deck ordering preserve exact card-ID outputs; empty/history states;
accessibility associations. Replace all English string selectors touched here.

**Done when:** persisted prompt copy is formatted exactly once for display and
all normal battle overlay grammar comes from Fluent.

### Task 11: Enable zero-baseline enforcement and synchronize documentation

**Depends on:** Tasks 3–10.

**Implementation:**

1. Run the localization rule across its complete scope and classify every
   finding. Migrate player copy, document opaque authored data, or add a narrow
   exclusion only when the file is demonstrably an operator/fixture surface.
2. Enable the rule as `error` in `eslint.config.js`. Keep zero baseline entries.
3. Retain `no-manual-count-copy` if it catches a more specific failure mode;
   otherwise fold its covered cases into the new rule and update tests without
   weakening count-selector enforcement.
4. Update `docs/journey_prototype/localization.md` and the grammar audit with:
   the descriptor contract, player boundary, authored RON/data boundary, battle
   prompt persistence rule, testing rule, and commands for regeneration/audit.
5. Regenerate `src/data/localization-messages.ts` and any affected Cumulus
   metadata. Run `npm run localization-types` once more and require a clean diff
   on the second run.

**Done when:** a repository-wide lint run finds zero unlocalized player-copy
literals in scope and the documentation accurately describes the implemented
architecture.

### Task 12: Integrated verification, browser QA, and review

**Depends on:** all preceding tasks.

**Automated verification:**

1. Run all focused tests named in Tasks 1–10 while iterating.
2. Run `scripts/regenerate-assets.sh` and inspect generated changes. A repository
   issue observed while writing this plan is already recorded in
   `pre-existing-issues.txt`: `scripts/tutorial-data.mjs` references
   `data/tabula/glossary.toml` while the canonical glossary is RON. If that issue
   is still present, keep it separate from localization scope and report the
   blocked command accurately.
3. Run `npm run localization-types`, `npm run review`, and, because this changes
   cross-cutting architecture and lint infrastructure, `npm run review:full`.
4. Inspect Fluent diagnostics while formatting every new selector domain. Test
   0, 1, and 2 for every valid count domain; document when zero is impossible.
5. Verify generated files are synchronized and `git diff --check` is clean.

**Browser QA:** use `/opt/homebrew/bin/agent-browser` against a Vite port other
than 5173, with a unique session. Assert `location.href` and viewport width
before acting, inspect `window.__caps`, and test both desktop and narrow widths.

Use the smallest matrix that covers the distinct risks:

- Normal bootstrap plus one recoverable application error or coop gate.
- Main menu/loading and `?goto=dream-avatar-select`.
- `?goto=dreamscape`, `?goto=deckviewer`, and `?goto=poolviewer`.
- Representative sites: `?goto=shop`, `?goto=augury`,
  `?goto=transfiguration`, and `?goto=exploration`.
- `?goto=battle` for the preview and `?goto=battle-playable` for the normal
  battle board. Exercise at least one picker/choice prompt through normal play
  or a deterministic synthetic state accepted by the existing QA tooling.
- `?goto=journeycomplete` or `?goto=journeyfailed` as a regression check for
  already-localized result grammar.

For each workflow, verify controls remain actionable, state transitions and
semantic attributes are correct, text and accessible descriptions are non-empty,
no raw Fluent IDs are visible, no text is clipped or overlapped at either
viewport, and `window.__caps` contains no render errors, unhandled rejections, or
console errors.

Request one independent review after automated and browser QA. Give the reviewer
this plan and the full branch diff. Verify each finding against the code, fix
confirmed issues, then commit with a detailed description and push immediately.

## Dependency and Parallelization Map

| Task                    | Depends on | Safe parallel peers | Primary contract owned                 |
| ----------------------- | ---------- | ------------------- | -------------------------------------- |
| 1. Inventory/lint rule  | None       | 2                   | Player-runtime enforcement scope       |
| 2. Descriptor generator | None       | 1                   | Generated descriptor and formatter     |
| 3. App/coop             | 2          | 4, 5, 6, 7, 8       | Application-state copy contract        |
| 4. Front door/chrome    | 2          | 3, 5, 6, 7, 8       | Menu and shared semantic IDs           |
| 5. Deck/Dreamscape      | 2          | 3, 4, 6, 7, 8       | Control options and site labels        |
| 6. Sites/Exploration    | 2          | 3, 4, 5, 7, 8       | Site state copy and authored-data seam |
| 7. Accessibility/reveal | 2          | 3, 4, 5, 6, 8       | Semantic reveal descriptions           |
| 8. Transfiguration      | 2          | 3, 4, 5, 6, 7       | Structured change descriptions         |
| 9. Battle prompt state  | 2          | 3–8                 | Persisted descriptor compatibility     |
| 10. Battle presentation | 9          | late work in 3–8    | Prompt display and overlay copy        |
| 11. Enable enforcement  | 3–10       | None                | Zero-baseline lint and docs            |
| 12. Acceptance          | 1–11       | None                | Integrated proof and review            |

When multiple agents work in parallel, assign one owner to
`data/tabula/strings.ftl` and `src/data/localization-messages.ts`, or require each
agent to use a unique catalog section and regenerate only during serial
integration. This avoids high-conflict generated-file edits.

## Acceptance Criteria

- The protected player-runtime scope contains no code-authored English
  translation units outside `strings.ftl`.
- Every remaining raw string in scope is demonstrably a machine token,
  diagnostic payload, authored-data value, or explicit developer/fixture
  exclusion.
- `FluentMessageDescriptor` is generated, ID-safe, variable-safe, JSON-safe for
  persisted use, and formatted only at presentation boundaries.
- Application-state views and battle prompts carry semantic values or
  descriptors, not formatted copy.
- Battle prompts survive JSON round trips, legacy `LOAD_STATE` normalization,
  replay, and cooperative folding with identical candidates, option indices,
  cursors, and resolutions.
- Transfiguration logic emits semantic change data while eligibility, preview,
  and mutations remain stable.
- Exploration preserves authored data verbatim and renders code-authored
  disclosures through complete Fluent messages.
- Accessibility descriptions for every reveal variant are complete messages
  without English fragment joins in TypeScript.
- New Fluent messages have translator-ready descriptions and complete selector
  coverage, including every valid zero state.
- Tests assert stable semantics and behavior rather than English UI strings.
- `npm run localization-types`, `npm run review`, and `npm run review:full` pass,
  or any pre-existing infrastructure blocker is recorded according to project
  policy.
- Desktop and narrow browser QA cover representative bootstrap, Journey, site,
  deck, battle, and result workflows with an empty `window.__caps` error buffer.

## Explicit Non-Goals

- Translating RON, JSON, tutorial dialogue, card rules, glossary definitions,
  site blurbs, card names, Dreamsign names, or other authored game-data catalogs.
- Selecting, persisting, negotiating, or deploying a locale.
- Adding non-English catalogs.
- Localizing editor, inspector, debug, operator, QA-fixture, image-viewer, or
  Cumulus documentation/demo surfaces.
- Changing battle resolution, event action shapes, candidate UUIDs, prompt
  indices, random sampling, or cooperative synchronization.
- Production deployment.
