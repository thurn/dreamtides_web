# Complete Player-Runtime React Localization

## Context

Dreamtides uses Project Fluent for application-authored player copy. The
English source catalog is `data/tabula/strings.ftl`; a generator produces the
typed message contract in `src/data/localization-messages.ts`; and React
components format messages through `useMessages()`. The catalog already covers
grammar-heavy parts of Journey completion, deck and pool browsing, Exploration,
Augury, Gamble, Transfiguration, and battle presentation.

The migration is incomplete. Player-runtime React still contains English text
nodes, control labels, empty states, error and connection messages,
accessibility descriptions, and option maps. Some non-React helpers also build
English strings and hand them to React. Battle-effect prompts are particularly
important because their English labels currently cross the event-fold boundary.

The goal is for every code-authored utterance in the normal player runtime to
come from `strings.ftl`, while state and rules continue to carry only semantic
data. This is source-catalog centralization and translation readiness; it does
not add locale selection or translations for another language.

## Scope

Include the player entry path, bootstrap and cooperative-play gates, recoverable
errors, Journey screens, Cumulus components, accessibility copy, adapters and
view models that prepare player presentation, and battle rules that create
interactive player prompts.

Exclude editor, debug and inspector, image-viewer, `/cumulus` documentation and
demo, test, QA, and synthetic-fixture surfaces. Authored card names, rules text,
guide dialogue, glossary definitions, site blurbs, and other prose in RON,
TOML, JSON, or similar catalogs remain opaque display data. The only
localization catalog changed by this work is `strings.ftl` and its generated
TypeScript contract.

Raw exception details, hashes, room IDs, UUIDs, and configuration IDs are
technical values rather than translation units. Localize their surrounding
labels and sentences, and never concatenate them into translated fragments.

## Implementation Plan

### 1. Establish the inventory and enforcement boundary

- Trace every normal player route and inventory headings, controls, status and
  empty-state text, validation and error messages, notifications, tooltips,
  accessible names and descriptions, and meaningful image alternatives.
- Include supporting TypeScript that creates presentation fields before React
  renders them. Distinguish opaque authored-data values from English grammar
  constructed in code.
- Add a tested ESLint rule for the player-runtime boundary. Reject English JSX
  text, literal values for copy-bearing props, and copy-shaped object fields.
  Permit machine identifiers, CSS values, log fields, thrown developer errors,
  and variables explicitly typed as authored data.
- Apply the rule with no baseline. Encode the excluded developer and fixture
  paths directly in ESLint configuration so new player-runtime copy cannot be
  hidden by a growing allowlist.
- Update the localization audit documentation with the enforced boundary and
  the authored-data exclusions.

### 2. Add a typed, locale-neutral copy descriptor

- Extend the localization type generator with a discriminated
  `FluentMessageDescriptor` union. Each member contains a valid Fluent message
  ID and either its exact generated variable shape or no variables when the
  message accepts none.
- Add one formatter for descriptors at React display boundaries. Keep the
  existing concise `useMessages()` API for direct calls in components.
- Use descriptors only when copy must cross a non-React boundary. Prefer raw
  semantic fields—counts, owner and state enums, booleans, and canonical
  display names—when a component can select the complete message itself.
- Do not put formatted Fluent output in Journey state, the cooperative event
  log, battle state, analytics dimensions, equality checks, parsing inputs, or
  test selectors.

### 3. Migrate the application shell and shared runtime components

- Move application loading, content failure, Firebase configuration, room
  creation and joining, version and content-configuration gates, unreadable and
  unreachable room states, and all associated actions into Fluent.
- Localize error-boundary fallback copy through a hook-capable child component.
  Preserve raw diagnostics only as explicitly labeled technical details or
  copyable data, not as part of a translated sentence.
- Localize cooperative bounce causes, hosted-playtest pause state, connection
  presence, and connection recovery announcements with semantic selectors and
  count-aware messages.
- Refactor application-state views so titles, messages, busy labels, actions,
  table headings, row labels, and fallback values are message descriptors or
  semantic values instead of English strings.
- Localize shared component defaults and accessibility copy, including card
  change states, rules-symbol names, HUD labels, Atlas metadata, tutorial
  feature callouts, command-menu fallback actions, glossary fallbacks, image
  descriptions, and loading states.

### 4. Migrate front-door, Journey, navigation, and site surfaces

- Make the main-menu view model expose stable action and social IDs rather than
  labels. Format the product title, menu actions, navigation landmark, community
  group, and brand accessibility names in the screen.
- Localize remaining Loading, tutorial, Dream Avatar selection, Journey HUD,
  utility-menu, and starting-deck controls. Authored tutorial dialogue and
  Dream Avatar content remain opaque data.
- Replace mobile and desktop deck filter and sort labels with semantic option
  IDs. Keep authored card subtype names as variables, and localize the complete
  filter or sort accessible message around them.
- Replace generated Dreamscape English such as battle tiers, Draft quantities,
  unrevealed-name fallbacks, site-lock guidance, and reward status with semantic
  model fields formatted in React. Site names and blurbs loaded from authored
  data remain unchanged.
- Localize the remaining player-facing titles, choices, validation states,
  confirmations, decline and leave actions, transient outcomes, and accessible
  groups for Shop, Draft, Dreamsign, Purge, Random Site, Augury, Exploration,
  Duplication, and Transfiguration flows.
- Stop appending English clauses to Exploration presentation strings. Carry the
  corresponding effect kind and values separately and let Fluent own the
  complete code-authored disclosure while preserving the surrounding
  catalog-authored narrative verbatim.

### 5. Make reveal accessibility descriptions semantic

- Replace punctuation and conjunction joins in the reveal coordinator with
  complete messages for Info Cards, definition groups, Tide alignment, and game
  cards.
- Pass optional card traits, Energy alternatives, Spark, Reclaim, and authored
  rules text as semantic values. Use selectors for presence and state rather
  than assembling English fragments.
- Keep authored titles, definitions, and rules text opaque. The wrapper message
  must remain valid when those variables eventually come from a localized data
  catalog.
- Verify that the hidden descriptions contain no raw message IDs and provide a
  coherent keyboard and screen-reader description for every reveal variant.

### 6. Make battle prompts locale-neutral

- Change `EffectPrompt` and persisted `ActivePrompt` copy fields from English
  `label`, `subtitle`, and option strings to stable typed message descriptors.
- Add complete Fluent units for every production Dreamwell and card-effect
  prompt, including picker instructions, confirmations, optional actions,
  counts, subtitles, and choice options. Synthetic fixture-only prompts remain
  outside the production rule boundary.
- Preserve prompt kinds, candidate UUIDs, selection counts, option order and
  indices, and resolution behavior exactly. Cooperative clients must fold the
  same descriptor IDs and semantic arguments independent of locale.
- Format descriptors only when building the player battle picker or choice
  surface. Log descriptor IDs and semantic arguments for reconstruction rather
  than formatted output.
- At the persisted-state load seam, normalize legacy English prompt fields to
  the known descriptor for each built-in prompt. Preserve its candidates and
  option indices. Map an unrecognized legacy label to a localized generic
  prompt without changing resolution semantics.
- Localize the remaining player battle overlays and normal controls, including
  Foresee, deck ordering, card notes, Dreamwell history, prompt validation,
  card-zone controls, and accessible battle status. Do not migrate battle
  inspector or context-menu commands.

### 7. Make Transfiguration presentation semantic

- Replace `TransfigurationOffer.description` with structured change data for
  Energy and Spark deltas, added abilities and keywords, widened triggers,
  activated-cost reduction, combined effects, and quoted authored rules text.
- Render the visible and accessible form names through Fluent instead of
  printing the `TransfigurationType` enum.
- Add complete messages for every change variant. Document numeric domains,
  whether source values can be zero, and that inserted card rules text is
  opaque authored content.
- Keep eligibility, preview-card construction, costs, selected form, and
  committed Journey mutations unchanged.

### 8. Author translator-ready Fluent and regenerate contracts

- Group messages by player surface and stable meaning. Reuse the existing
  private Dreamtides terms for canonical vocabulary where the complete message
  permits it.
- Keep articles, verbs, modifiers, punctuation, and word order inside complete
  messages. Use numeric and semantic selectors rather than manual plural or
  state branches in React.
- Place a translator description immediately above every new message or
  cohesive group. State the placement, player consequence, actor and object,
  tense or mood, every variable's domain and zero behavior, and genuine layout
  or accessibility constraints.
- Run `npm run localization-types`, inspect the generated contract, and
  regenerate affected Cumulus metadata and repository assets.

## Public Interface and Compatibility Changes

- The generated localization module exports `FluentMessageDescriptor` in
  addition to message IDs and argument mappings.
- Application-state views carry descriptors or semantic values instead of
  English titles, messages, actions, and table labels.
- Main-menu, Dreamscape, deck-filter, and Transfiguration view models expose
  stable semantic IDs and raw values; React screens own localization.
- Battle prompt state carries descriptor IDs and semantic arguments. Prompt
  resolution wire shapes and event actions remain unchanged.
- Legacy pending prompts are normalized at load time. No migration of authored
  game-data catalogs is part of this work.

## Verification and Acceptance Criteria

- Add synthetic ESLint-rule tests covering rejected JSX text, copy props,
  template literals, and copy-shaped view-model fields, plus accepted Fluent
  calls, descriptors, technical tokens, and authored-data variables.
- Run `npm run localization-types` and retain its existing synchronization test
  for `strings.ftl` and the generated TypeScript contract.
- Add structural formatter tests for every new selector domain and all valid
  zero, one, and multiple count cases. Assert successful formatting and absence
  of diagnostics or message-ID leakage, not specific English UI strings.
- Test every application-state kind, cooperative bounce cause, main-menu action,
  deck control, generated Dreamscape state, site lock, Transfiguration change,
  battle prompt kind, legacy prompt normalization path, and reveal-description
  variant using stable roles and semantic `data-*` attributes.
- Verify production battle prompts survive JSON round trips and deterministic
  event replay with descriptor IDs and semantic arguments while retaining the
  same candidates, option order, and resolutions.
- Replace affected string-based test selectors with roles, stable semantic
  attributes, or test IDs. Do not add tests that assert which English UI string
  is used.
- Run focused tests while iterating, followed by
  `scripts/regenerate-assets.sh`, `npm run review`, and, because the change is
  cross-cutting, `npm run review:full`.
- Perform browser QA through representative normal workflows at desktop and
  narrow viewports: an application state, main/loading/tutorial, Dream Avatar
  selection, Dreamscape and deck controls, representative sites, a battle
  prompt, and a battle result. Check accessible output, translated-text
  expansion, clipping, raw IDs, interactions, and `window.__caps`.
- Request one independent review before the final commit. Fix every confirmed
  finding, commit with a detailed description, and push immediately.

Completion means the player-runtime lint boundary contains no code-authored
English translation units outside `strings.ftl`; every allowed raw string is a
verified machine token, diagnostic payload, proper authored-data value, or
explicitly excluded developer fixture; and no localized output participates in
game logic or persisted state.

## Execution Assumptions

- Execute the implementation in the repository-required isolated worktree and
  keep follow-up changes in that worktree until promotion is resolved.
- English remains the only bundled locale for this project phase. Locale
  discovery, locale persistence, additional translation files, and production
  deployment are separate work.
- Do not modify authored RON, TOML, JSON, card rules, tutorial dialogue,
  glossary definitions, or other game-data prose as part of this migration.
- Do not commit screenshots or other image files.
