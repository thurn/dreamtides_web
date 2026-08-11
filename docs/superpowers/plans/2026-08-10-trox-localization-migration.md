# Quest Prototype Trox Localization Migration

> [!WARNING]
> **Exact source-English parity is mandatory.** This migration may change where
> player-facing copy is authored and how semantic inputs reach it, but it may
> not change the rendered English for any existing state. Preserve every word,
> capitalization choice, punctuation mark, meaningful space, line break,
> interpolation, visible label, accessible name, and accessible description.
> A copy edit requires separate user authorization. If a callsite cannot be
> represented in Trox without changing its source-English output, stop and
> report that conflict instead of weakening the message design.

**Status:** Proposed implementation plan for a Luna implementation agent

**Audited quest commit:** `ee2b487b8` (`master` on 2026-08-10)

**Audited Trox commit:** `f70bdd1ae7707fb294dd7051a8f7a369ca3c6805`

**Trox source:** `~/trox`

**Scope:** Replace the quest prototype's existing Fluent-authored TypeScript and
TSX localization with Trox, including runtime resolution, extraction, locale
workflow, lint/review integration, and the locale-neutral battle-prompt state
which currently contains Fluent descriptors.

**Out of scope:** Localizing player-facing content authored in canonical RON or
generated from RON, changing that content's English copy, adding production
translations, adding a player locale picker, and localizing editor/debug/operator
surfaces excluded by the existing player-localization boundary.

## Outcome

The final quest tree contains no `.ftl` resource, Fluent manifest, Fluent
runtime or parser dependency, Fluent formatter/generator/validator, Fluent
message ID, or `FluentMessageDescriptor` state. Player-runtime TypeScript and
TSX author complete source-English messages at their semantic use sites with
Trox `tx`, `txa`, `plural`, `ordinal`, and `select` calls. Those calls return
immutable `LocalizedString` values which remain unresolved through view models
and resolve only at React or another explicit presentation boundary.

Trox owns extraction, source reports, locale-specific row expansion, canonical
bundles, source fallback, target number formatting, placeholder isolation, and
runtime diagnostics. Application code owns raw semantic values: counts,
positions, owner and participant roles, entity kinds, stable IDs, optionality,
and authored data values. Translation rows receive enough semantic structure to
express target-language number, agreement, word order, and accessibility copy
without reverse-engineering English or reading application code.

The migration is intentionally not a message-ID translation. Each current
Fluent callsite is re-audited from the value's source. Fluent selectors which
represent product control flow become ordinary TypeScript branches; grammatical
relationships remain one Trox message family. Fixed game vocabulary stays
literal in complete messages. Trox terms are added only when a runtime-selected
concept actually needs a requested form, count, or locale facet.

## Start Here

The implementing Luna agent must do this before editing:

1. Read `AGENTS.md`, `.llms/skills/localization/SKILL.md`, this plan,
   `docs/journey_prototype/localization.md`,
   `docs/journey_prototype/localization-grammar-audit.md`, and
   `docs/journey_prototype/firebase_multiplayer.md`.
2. Read `~/trox/README.md` completely and verify `~/trox` is at the audited
   revision. At this revision the authoritative contract is the consolidated
   README, implementation, and tests; the design/evolution/syntax paths named
   by the localization skill are absent from the repository.
   If the revision differs, compare the TypeScript authoring API, scanner,
   bundle schema, `SourceCatalog`, `Localizer`, CLI commands, and tests before
   following this plan; update the pinned runtime snapshot and this document if
   any contract changed.
3. Use the repository-required `wt` workflow. Create a fresh worktree, run
   `npm install`, and run `scripts/regenerate-assets.sh` once from that
   worktree. Record any pre-existing failure in `pre-existing-issues.txt` as
   required by `AGENTS.md`.
4. Record the quest starting commit as the immutable parity baseline. Build the
   parity ledger in Task 1 before changing the first Fluent resource or
   callsite.
5. Keep Fluent and Trox providers side by side only while migration tasks are
   in progress. The final cutover task deletes every Fluent path and verifies
   that the application mounts only the Trox provider.
6. Run focused tests after each task. Run `npm run review` after each stable
   batch. This is cross-cutting runtime, lint, generated-data, persistence, and
   accessibility work, so the final acceptance pass also runs
   `npm run review:full` and one independent review.

## Current Baseline

The audited tree has:

- 9 Fluent resources under `data/locales/en-US/`, totaling 1,952 lines;
- 577 Fluent messages and 27 Fluent terms;
- 69 TypeScript/TSX files calling `useMessages()`;
- 17 production files constructing `FluentMessageDescriptor` values;
- one generated message-ID/argument contract in
  `src/data/localization-messages.ts`;
- one English `ReactLocalization` built by `src/data/localization.ts`;
- one provider in `src/cumulus/CumulusRoot.tsx`;
- Fluent-aware lint, formatter, generator, review, regeneration, ownership, and
  documentation paths; and
- descriptor-bearing built-in battle prompts persisted inside folded battle
  state, compacted snapshots, replay fixtures, and explicit `LOAD_STATE`
  imports.

The current catalog families are:

| Resource | Messages | Principal responsibility |
| --- | ---: | --- |
| `accessibility.ftl` | 133 | Accessible names, reveal and state announcements |
| `app-shell.ftl` | 48 | Bootstrap, errors, main menu, shared command chrome |
| `battle-prompts.ftl` | 7 | Persisted prompts and compatibility fallbacks |
| `battle.ftl` | 88 | Battle controls, zones, results, prompts, and history |
| `cards.ftl` | 46 | Deck/pool controls, card presentation, glossary fallbacks |
| `coop.ftl` | 49 | Room gates, bounce status, presence, content comparison |
| `journey.ftl` | 69 | Journey start/status/results, menus, tutorial labels |
| `sites.ftl` | 136 | Exploration, Gamble, card changes, and shops |
| `terms.ftl` | 1 + 27 terms | Vocabulary and invalid-message fallback |

This inventory is a starting measurement, not the migration unit. A single
Fluent message can have semantically different callsites, and several Fluent
messages currently compose fragments which Trox must replace with complete
units.

## Target Architecture

### Runtime and presentation boundary

Add a small quest-owned Trox integration under `src/localization/`:

- `runtime.ts` loads the generated source bundle, constructs the source-locale
  `Localizer`, exposes the `SourceCatalog`, and records structured bundle and
  resolution diagnostics through the existing journey logger.
- `context.tsx` provides the active `Localizer`, locale ID, text direction, and
  a resolver function. Tests can inject a synthetic target bundle without
  mutating global state.
- `use-localizer.ts` returns a stable resolver whose input is a
  `LocalizedString`, not a message ID and argument bag.
- `testing.ts` contains synthetic-bundle helpers used only by deterministic
  localization tests.

The minimum application contracts are:

```ts
type ResolveMessage = (message: LocalizedString) => string;

function useLocalizer(): ResolveMessage;
function resolveChecked(message: LocalizedString): string;
```

Do not create a quest wrapper around `tx`, `txa`, selector arms, argument maps,
patterns, or descriptions. Trox scans source lexically. Every authoring call,
pattern, branch, inline argument object, and literal translator description
must remain visible at the direct `tx` or `txa` callsite.

The production source-locale localizer uses the generated `en-US` source bundle
as both target and source and resolves through Trox's recovering source path.
The source-mode integration does not report the expected target-row miss for
every message; it must still log bundle-load failures, an unresolved source
entry, a visible `⟦tx1_…⟧` recovery marker, and every diagnostic from an actual
target bundle. A future production target uses
`new Localizer(target, source, { strict: true, diagnostic })`.

Set the document `lang` and `dir` from the provider's locale metadata. The
default remains `en-US` and `ltr`. Direction must not be inferred from the
locale string in React components.

### Toolchain and dependency boundary

The quest build and CI must not depend on an untracked home-directory package.
Pin the audited Trox revision in a small checked file and vendor the built
`@trox/runtime` package output from `~/trox/packages/trox` under
`vendor/trox-runtime/`, including its package metadata, JavaScript,
declarations, license, and upstream revision marker. Point `package.json` at
`file:vendor/trox-runtime`. Do not hand-edit vendored output.

Add `scripts/sync-trox-runtime.mjs` which:

1. resolves `TROX_ROOT` or defaults to `~/trox`;
2. verifies the exact pinned commit;
3. runs the Trox package's install, typecheck, tests, and build;
4. replaces only `vendor/trox-runtime/` with the distributable package files;
5. writes the upstream revision marker; and
6. verifies a second sync is byte-identical.

Add `scripts/trox.mjs` as the sole quest CLI entry. It resolves `TROX_ROOT`,
verifies the pin, and runs the pinned Rust CLI with `--locked` and the root
`trox.ron`. Package scripts expose `trox:check`, `trox:extract`, and
`trox:bundle`. GitHub Checks checks out `thurn/trox` at the pinned revision into
the runner temporary directory and supplies `TROX_ROOT`; Firebase build jobs
need only the vendored runtime and committed source bundle.

### Trox project files

Add:

- `trox.ron` at the quest root;
- `localization/terms.ron`, initially `{}`;
- `localization/reports/en-US.csv`;
- grammar-stress locale profiles and untranslated CSVs for `ar`, `es`, `ja`,
  and `ru` under `localization/qa/`; and
- generated canonical bundles under `src/generated/localization/`.

The root configuration scans production `.ts` and `.tsx` authoring files and
excludes tests, fixtures, generated output, vendored code, editor/debug tools,
and RON. RON is deliberately absent from the configured sources for this
migration. The representative target profiles are QA expansion profiles, not
declared product-language support. They exist to expose Arabic plural/RTL
isolation, Spanish agreement pressure, Japanese other-only grammar, and Russian
few/many categories while source messages are designed.

`trox check --deny warnings` is the clean authoring and CSV-synchronization
gate. `trox extract` owns all report rows. `trox bundle` creates the strict
source catalog. QA target bundles use `--allow-missing` because the project has
no authorized translations; those bundles are marked development-only and are
never deployed as completed translations. Any production target bundle must be
built without `--allow-missing`.

### In-memory localized values

React view models and non-persisted controller values may carry
`LocalizedString` directly. Rename fields from `*Descriptor` to `*Message` when
that improves the contract. Resolve them only when assigning a DOM string,
accessible name/description, canvas text, browser prompt, or another explicit
presentation sink.

Never compare, concatenate, template-interpolate, parse, serialize with generic
JSON, use as a map key, or log the resolved text. Behavior continues to use
semantic IDs, UUIDs, enum values, counts, and action indices.

### Persisted battle prompt values

Do not replace `FluentMessageDescriptor` with a serialized Trox message merely
to preserve the old shape. Trox identities are content-derived, and battle
state should not change when translator context or source copy is revised.

Replace the built-in Fluent branch of `BattlePromptText` with a closed,
JSON-safe `BuiltInBattlePromptRef` discriminated union. Its variants identify
the seven current meanings—discover Character, confirm yes, confirm skip,
generic prompt, generic subtitle, generic option, and switch side—and carry raw
semantic arguments such as `side`. A presentation function maps each variant
to a direct `tx`/`txa` call. `DreamwellPromptRef` remains RON-owned and
unchanged; `LegacyPromptText` remains the explicit import compatibility shape.

The minimum persisted contract is:

```ts
type BattlePromptText =
  | BuiltInBattlePromptRef
  | DreamwellPromptRef
  | LegacyPromptText;
```

This byte-level fold change increments `CURRENT_REDUCER_VERSION` from
`dreamtides-coop-v24` to `dreamtides-coop-v25`. Keep
`COMPATIBLE_LEGACY_REDUCER_VERSIONS` empty. Version 24 rooms open the Version
Gate before log construction, fold, compaction decode, or append. The explicit
`LOAD_STATE` path inside a version 25 room normalizes known v24 Fluent
descriptors and older legacy strings to the new semantic refs before validation.

Prompt logs record the semantic prompt-ref variant and raw arguments, plus the
existing card UUIDs, candidate instance IDs, option indices, counts, script
references, and resolution. They never record resolved text. Trox entry IDs may
be added as observational presentation diagnostics, but they do not replace the
semantic prompt identity.

## First-Principles Message Design Rules

These rules apply to every task below and are completion criteria, not optional
review advice.

### Audit every dynamic input

For every current `t(id, variables)`, descriptor constructor, dynamic message
ID, and Fluent selector, trace each input to its source and record:

- semantic meaning and provenance;
- runtime type and complete domain;
- whether absence, zero, negative, fractional, unknown, or future enum values
  are possible;
- whether the input is visible, selector-only, or both;
- whether it is already formatted, localized, or concatenated;
- whether a translator may move, repeat, or omit it safely;
- person, owner, grammatical number, ordinal role, gender/animacy/noun-class
  needs, case pressure, article/classifier pressure, and agreement; and
- whether the branch is grammar within one utterance or ordinary product flow.

Do not infer semantics from the old Fluent variable name. The same current
placeholder can carry a count at one callsite and a display string at another.

### Numeric roles

Classify every number before choosing Trox syntax:

- A cardinal count which controls noun or verb grammar uses
  `plural(rawCount, …)`. Verify a nonnegative safe-integer domain and identify
  the visible count, even when it is a different numeric value.
- Deliberate zero product wording uses `exact(0, …)` before plural branches.
  Verify that zero is reachable and that the special wording is intentional.
- An ordinal position such as a turn, attempt, tier, pack, or card position
  uses `ordinal(rawPosition, …)`. Verify a positive safe integer. Translators
  may express order differently even when English displays a bare digit.
- A signed or fractional scalar stays a visible `txa` numeric argument, with a
  semantic sign/state branch when grammar needs one. It is never an input to
  `plural` or `ordinal`; verify product-owned rounding and formatting.
- An enum with numeric-looking keys, such as the `"0"`–`"4"` cost filter, uses
  `select` on the string enum because it represents product state.
- A progress pair such as selected/required or visible/total uses two named,
  described numeric arguments. Pluralize only the quantity governing the noun.
- A resource amount or score stays a numeric scalar. Trox formats locale
  digits; the product owns units and rounding.

Known high-risk examples which must be explicitly checked:

- `battle-zone-browser-filtered-count` pluralizes by total cards while displaying
  both visible and total counts.
- Journey-complete stat labels use a selector-only count because the numeric
  value renders in a separate visual field.
- `coop-presence-connected-count` has English `1 Connected` and displays the
  placeholder only outside the one branch.
- `transfiguration-form-choice` has deliberate exact-zero “free” wording.
- Exploration mutation messages contain several independent counts; do not
  reuse one count for multiple selectors by convenience.
- `openingHandDelta` and Energy/Spark deltas must be traced to determine whether
  the callsite passes a magnitude or a signed value.
- `packNumber`, `attemptNumber`, `tierNumber`, card positions, and turn headings
  carry order semantics even where English uses cardinal digits.

### Entities, names, and agreement

RON-owned card, Dream Avatar, Dreamsign, Figment, guide, site, subtype, rules,
and narrative strings remain raw authored source-English values in this scope.
Pass them as specifically named scalar placeholders only when the containing
message can treat them as grammatically opaque. A useful description states
the entity kind, provenance, and absence of grammatical metadata.

Do not add an English article before an entity placeholder. Do not guess gender
from a name, card type, spelling, or enum. When application state already knows
an agreement-relevant fact—owner, side, singular/plural, entity kind, living vs
nonliving category, or speaker role—pass it as an explicit semantic selector
even if the English leaves are identical. For names whose RON source supplies
no gender or case metadata, design target rows so the proper name can remain
uninflected and agreement-neutral. If a target language cannot express an
acceptable row without new RON metadata, record a scoped data-localization
follow-up and stop that locale's production rollout; RON edits are not part of
this migration.

Specific callsites to challenge include `character-dialogue-accessible-name`,
`battle-victory-summary`, Dream Avatar art labels, Dreamsign replacement pairs,
card Transfiguration descriptions, tutorial challenge outcomes, and any message
using `cardName`, `avatarName`, `speakerName`, `figmentName`, `formName`, or
`siteType`.

### Complete messages and composition

- Every selector leaf is a complete sentence, complete accessibility
  announcement, or complete UI label.
- Fixed vocabulary such as Card, Essence, Energy, Spark, Deck, Dreamsign, and
  Battle stays literal in the complete message unless one runtime-selected
  grammatical operation proves a Trox term is necessary.
- Begin `localization/terms.ron` empty. Do not port the 27 Fluent terms as a
  dictionary. A proposed term must name the callsite which varies the concept
  at runtime, the requested form/facet, and the locale behavior it enables.
- Use host control flow for separate screens, actions, errors, and outcomes.
  Use `select` only when translators need one family to preserve a tight
  semantic or grammatical relationship.
- Do not pass punctuation, conjunctions, articles, prepositions, translated
  fragments, pluralized nouns, or preformatted number/unit phrases as scalar
  arguments.
- Do not resolve one Trox value and insert that string into another Trox
  message. `opaque` is valid only for an atomic Trox value with no arguments or
  selectors and no grammatical interaction.

The existing reveal helpers `reveal-description-join` and `reveal-list-and`
are a known architectural mismatch. Replace arbitrary string reduction with a
semantic sequence of independently complete accessibility utterances, each
resolved into its own hidden DOM node and associated in deterministic order.
Energy alternatives remain raw numbers and render through a finite complete
message shape; they are not joined with localized “and” strings in TypeScript.
Verify the browser's computed accessible description preserves the exact
source-English punctuation and meaningful spacing from the parity ledger.

The battle picker progress currently embeds a resolved prompt label inside a
larger localized sentence. Built-in prompt refs must let the presentation layer
author a complete combined message when the relationship is grammatical.
RON-owned Dreamwell prompt text cannot become a nested Trox message in this
scope; present its complete instruction and the localized owner/progress status
as separate semantic DOM units instead of interpolating a prelocalized string.
Verify exact visible and accessible source output before accepting that split.

### Duplicate English and meaning keys

Trox identity is content-derived. Identical English patterns with different
placement or consequences need `meaning(...)`; truly identical semantic uses
must share the same literal description. Run a duplicate-pattern audit before
extraction and after every batch.

The current catalog already contains ambiguous duplicate groups including:

- Ability (battle preview vs tutorial feature);
- Avatar (deck label vs accessible status name);
- Back (battle phase vs command menu);
- Cancel across note, deck order, merge, tutorial targeting, Bazaar, and
  Dreamsign Revelation actions;
- Choose, Choose Again, Close, Cost, Retry, Skip, Spark, and Subtype;
- Dreamtides as product title and application eyebrow;
- Fast and Interrupt as attributes, reveal utterances, and modification labels;
- New Journey in menu, tutorial, and failure-result contexts; and
- repeated Exploration compound accessibility patterns with distinct outcomes.

Do not use old Fluent IDs mechanically as meaning keys. Choose short stable
semantic discriminators only where translators need distinct treatment.

### Translator descriptions

Every direct `tx`/`txa` call has one nonempty literal description. It states:

- surface and role (visible title/action/status, tooltip, live region, image
  description, accessible name, or accessible description);
- actor, action, object, tense/mood, and player consequence;
- every argument's semantic meaning, type, complete domain, visibility, and a
  realistic example;
- every selector's meaning and fallback behavior;
- entity provenance and available/unavailable agreement metadata; and
- genuine compactness, line-break, or screen-reader constraints.

Descriptions do not repeat the English, prescribe English word order, or tell
translators to preserve English capitalization. Multiple descriptions for one
Trox identity are a design finding: share the semantic contract or add a
meaning discriminator.

## Source-Copy Parity Ledger

Task 1 creates a task-local machine-readable ledger outside tracked source,
plus a human audit view. One row represents one semantic callsite, not merely
one Fluent ID. Record:

- source file and callsite anchor;
- old Fluent ID and exact pre-migration source output;
- placement/accessibility role;
- each argument's provenance, type, domain, and grammar notes;
- every finite select/boolean/presence branch;
- valid numeric probes including `0`, `1`, `2`, a larger value, and every
  behavior boundary;
- the proposed Trox authoring kind, meaning key if any, and description;
- the post-migration resolved source output; and
- parity status for text, punctuation, whitespace, line breaks, and accessible
  computation.

Before deleting Fluent, use the current `appLocalization`, generated contracts,
FTL resources, and explicit callsite-domain maps to emit baseline outputs. Do
not guess arbitrary values for a selector. Trace the real union/enum and add an
explicit ledger domain. The ledger may assert English because it is temporary
review evidence; committed application tests must remain semantic and
locale-neutral.

## Early Vertical-Slice Gate

The migration proves one real screen end to end before any parallel callsite
batches begin. Use the Pool Viewer overlay reached through
`?goto=poolviewer`. It is a bounded, directly bootable player screen with
existing responsive tests and browser QA support, while still exercising the
contracts most likely to expose a weak localization design:

- static visible labels and accessibility-only labels;
- semantic selectors for viewer context, source, sort, type, direction, empty
  state, and cost filter;
- numeric-looking cost-filter enums which must not become plural selectors;
- `visibleCount` and `totalCount`, where the total controls the noun grammar;
- independent Tide, deal-size, copy-cap, drawn-count, and available-count
  quantities;
- a raw stable algorithm ID displayed inside a complete human message;
- an error value whose producer must be classified before it crosses the
  presentation boundary; and
- source-authored card names and rules text which remain raw because RON
  localization is outside this migration.

This is retained production architecture, not a disposable spike. The slice
uses the pinned CLI, committed config, source bundle, target profile, React
provider, resolver, diagnostics, parity ledger, and ordinary regeneration
path. Every later migration batch copies the proven authoring and presentation
idioms.

The slice generates `localization/qa/es.csv` as the first localizer-facing
artifact. “Working CSV” means extraction creates canonical active rows for the
screen; each row has understandable English, conditions, description,
placeholder schema, source locations, and workflow state; translator edits and
notes survive re-extraction; and an allow-missing development target bundle can
be loaded. Checked resolution must report a missing target row, while the
recovering path must produce source fallback. The implementation agent must not
invent Spanish. Translation cells remain missing until a Spanish-speaking
translation owner reviews them. Runtime reordering, repetition, omission,
isolation, and failure behavior are proven with synthetic target fixtures
rather than presenting machine-generated copy as a translation.

Tasks 5–14 are blocked on the Task 4 go/no-go review. If the screen cannot
preserve exact source English, the CSV makes a semantic input unclear, Trox
cannot express a required contract, target loading emits an unexplained
diagnostic, or the proof requires a quest-specific authoring wrapper, repair
Tasks 1–4 before scaling the migration.

## Detailed Task Breakdown

### Task 1: Freeze the baseline and make the migration inventory executable

**Objective:** Establish complete, callsite-level proof of scope and source
parity before either runtime changes.

**Files to inspect or change:**

- all files under `data/locales/en-US/`;
- `src/data/localization.ts`, `localization-messages.ts`, and
  `localization-descriptors.ts`;
- `src/cumulus/hooks/use-messages.ts` and `src/cumulus/CumulusRoot.tsx`;
- `eslint-rules/ui-boundary-roles.js`,
  `no-unlocalized-player-copy.js`, and `no-manual-count-copy.js`;
- `scripts/audit-player-localization.mjs` and tests;
- every production file reported by `useMessages`,
  `createMessageDescriptor`, `FluentMessageDescriptor`, `appLocalization`, or
  `@fluent/` searches; and
- the temporary parity-ledger generator and output outside tracked source.

**Implementation:**

1. Record the starting quest and Trox commits in the ledger.
2. Enumerate all 577 messages, 27 terms, every message reference, dynamic ID,
   descriptor producer/consumer, formatter boundary, and persistent/logging
   boundary. Record zero-reference and multi-reference messages explicitly.
3. Make the inventory script classify direct formatting, descriptor transport,
   accessibility-only output, browser APIs, persisted prompt state, logs,
   RON-authored passthrough, and excluded developer surfaces.
4. For each callsite, populate the semantic audit fields described above.
   Resolve computed IDs such as Journey stat IDs and constant message maps to
   their closed domains.
5. Generate exact Fluent baseline output for every ledger case. Include
   visible strings, placeholders, tooltips, live regions, `aria-label`,
   `aria-describedby`, alt text, browser `prompt`, and error/detail regions.
6. Add a temporary duplicate-English report and identify each duplicate as
   shared semantics or a required Trox meaning discriminator.
7. Add a temporary preformatted-value report for string joins, template
   interpolation, resolved-message interpolation, display-name maps, and
   values containing English articles, punctuation, units, lists, or number
   formatting.

**Focused verification:** run the inventory tests and compare the measured
counts with the baseline above. The ledger must cover every generated Fluent ID
and every production reference. A message with no live production reference is
recorded as deletion-only, not silently omitted.

**Done when:** every current Fluent unit and callsite has an owner, semantic
domain, parity fixture, and target task in this plan; every duplicate and
preformatted value is classified.

### Task 2: Pin Trox and integrate its CLI, configuration, and generated artifacts

**Depends on:** Task 1.

**Objective:** Make Trox reproducible in worktrees, clean clones, CI, and
Firebase builds before application callsites depend on it.

**Files to add or change:**

- pinned revision file;
- `vendor/trox-runtime/`;
- `scripts/sync-trox-runtime.mjs` and focused tests;
- `scripts/trox.mjs` and focused tests;
- `trox.ron`;
- `localization/terms.ron`;
- `localization/reports/en-US.csv`;
- `localization/qa/{ar,es,ja,ru}.ron` and corresponding CSV paths;
- `src/generated/localization/*.trox.json`;
- `package.json` and `package-lock.json`;
- `.github/workflows/checks.yml`; and
- `.gitignore` only for untracked Trox build caches, never generated reports or
  source bundles.

**Implementation:**

1. Pin `f70bdd1ae7707fb294dd7051a8f7a369ca3c6805`. Build and vendor
   `@trox/runtime` from that exact revision. Preserve its license.
   The sync wrapper runs `npm ci`, `npm run typecheck`, `npm test`, and
   `npm run build` at `TROX_ROOT`, then copies only the package files allowed
   by `packages/trox/package.json` plus the upstream license and revision
   marker. The CLI wrapper executes the equivalent of
   `cargo run --locked --manifest-path "$TROX_ROOT/Cargo.toml" -p trox-cli
   --bin trox -- --config <quest-root>/trox.ron <arguments>`.
2. Add deterministic sync and CLI wrappers with synthetic tests for a missing
   repo, wrong revision, failed upstream build, successful argument forwarding,
   and byte-identical second sync.
3. Configure TypeScript/TSX source globs for the protected player runtime and
   exact non-React producers. Exclude tests, generated output, vendored code,
   RON, and developer surfaces.
4. Start `terms.ron` as an empty map. A later task may add a term only after the
   required runtime grammatical operation is documented.
5. Add source and QA output paths. Profiles use locale-owned direction,
   isolation, plural behavior, and facets; application code never imports a
   target-language gender classification.
6. Run `trox extract`, inspect the initial reports, and run
   `trox check --deny warnings`. Build the source and development-only QA
   bundles. Repeat extraction and bundling and require byte-identical output.
7. Update Checks CI to obtain the pinned CLI. Cache its Cargo build separately
   from `tools/game-data` without changing Firebase build inputs.

**Tests:** wrapper behavior, config discovery, clean extraction, clean check,
canonical bundle load through `bundleFromCanonicalJSON`, and deterministic
second generation.

**Done when:** `npm ci` and `npm run build` work without `~/trox`, localization
authoring/check/regeneration works through the pinned `~/trox` CLI locally, and
CI can run the same revision.

### Task 3: Install the Trox runtime and presentation boundary

**Depends on:** Task 2.

**Objective:** Provide a checked resolver and React context while Fluent still
serves unmigrated callsites.

**Files to add or change:**

- `src/localization/runtime.ts` and tests;
- `src/localization/context.tsx` and tests;
- `src/localization/use-localizer.ts`;
- `src/localization/testing.ts`;
- `src/cumulus/CumulusRoot.tsx`;
- `src/main.tsx` if document language/direction belongs at the entry boundary;
- `src/logging.ts` only as needed for structured Trox diagnostics; and
- focused test fixtures for source, Russian plural, Arabic RTL/isolation,
  Japanese reordering, and long translations.

**Implementation:**

1. Parse committed bundle JSON with Trox's canonical loader; do not trust a
   generic JSON cast.
2. Construct the source-mode localizer and provide a strict target-localizer
   factory. Diagnostic callbacks must never throw.
3. Log bundle locale, direction, catalog fingerprint, and load outcome. Log
   resolution diagnostics with code and entry ID, never resolved player text.
4. Mount the Trox provider beside Fluent temporarily. Expose locale and
   direction through context and set document metadata.
5. Add a hook that resolves only `LocalizedString`. Do not accept raw strings,
   message IDs, patterns, or argument bags.
6. Prove `LocalizedString` cannot be implicitly converted, compared as text, or
   lost through an accidental generic JSON round trip.
7. Add an error-boundary-safe source fallback for provider bootstrap failure
   which uses a pre-resolved emergency string only at the final catastrophic
   boundary; classify and document that narrow exception in the localization
   lint inventory.

**Tests:** source resolution, strict source/target compatibility, target
placeholder reordering/repetition/omission, target number formatting, Arabic
isolation and direction, missing target row recovery, malformed bundle failure,
diagnostic hook non-throwing behavior, and React provider injection.

**Done when:** a component can resolve an inline Trox value at presentation,
synthetic target bundles exercise the portable checked contract, and unmigrated
Fluent screens still render during the staged migration.

### Task 4: Prove the complete workflow on the Pool Viewer screen

**Depends on:** Tasks 1–3.

**Objective:** Validate the retained Trox infrastructure, translator handoff,
source fallback, exact-English parity, and browser presentation on one
representative screen before broad migration work begins.

**Primary files:**

- `src/cumulus/screens/PoolViewerScreen.tsx` and its focused tests;
- the Pool Viewer adapter/view-model and every producer of `view.error`;
- `src/runtime/qa-scenes.ts` only if the existing `poolviewer` scene needs a
  deterministic semantic state for a missing branch;
- the Trox provider/bootstrap path for a development-only `qaLocale` override;
- `localization/reports/en-US.csv` and `localization/qa/es.csv`;
- generated source and allow-missing Spanish QA bundles;
- the parity ledger rows owned by this screen; and
- `docs/journey_prototype/qa_scenes.md` if the query contract changes.

**Implementation:**

1. Inventory every player-visible, tooltip, empty/error, accessible-name, and
   accessible-description output rendered by `PoolViewerScreen`, including
   values supplied through child-component props. Freeze every finite selector
   arm and valid numeric boundary in the parity ledger before editing.
2. Trace `view.error` to its producers. If it is player-facing source copy,
   carry a semantic error kind or `LocalizedString` into the screen and include
   its complete messages in this slice. Keep technical detail in a separate raw
   field. Do not pass a preformatted English error through Trox as a scalar.
3. Author the screen's complete messages directly with `tx` and `txa`. Keep
   fixed Card and Tide vocabulary literal. Use the total count to select the
   grammatical form in “visible of total cards,” while binding visible and
   total as separately named numeric arguments. Independently audit Tide count
   and deal size. Treat cost values `0`–`4`, `5plus`, and `x` as product enum
   branches, not cardinal grammar.
4. Give every selector and argument a translator-visible semantic contract.
   Descriptions must explain why visible count can differ from total count,
   what each source/sort/filter enum means, that algorithm ID is stable raw
   diagnostic text, and which RON-authored names have unavailable grammatical
   metadata. Add `meaning` only where identical English on another surface has
   a genuinely different role.
5. Resolve only while creating the concrete string props consumed by
   `SegmentedControl`, `Select`, `DisclosureSection`, and `CardBrowserPanel`.
   Leave the rest of the application on Fluent during this gate. The Pool
   Viewer itself must contain no Fluent formatter call or message ID once the
   slice is complete.
6. Run scoped Trox extraction and inspect every active Pool Viewer row in the
   source report and `localization/qa/es.csv`. Record the row count in the
   parity ledger rather than this plan. Verify source, conditions, descriptions,
   placeholders, source locations, row ordering, and status manually. Reject
   vague placeholder names, fragmentary leaves, incomprehensible conditions,
   accidental row cross-products, or duplicate-English identity collisions.
7. Prove non-destructive CSV synchronization in a temporary test copy: add a
   syntactically valid representative translation and translator note, rerun
   extraction, and verify both survive byte-for-byte in their managed rows.
   Also verify source changes mark the row stale with previous translation,
   removed rows become obsolete, and a second unchanged extraction is
   byte-identical. Do not commit the invented test translation to `es.csv`.
8. Build and load the source bundle strictly. Build the Spanish QA bundle with
   `--allow-missing` and load it through the target path. Verify checked
   resolution reports the expected missing target row and recovering resolution
   produces source fallback without a raw placeholder, entry ID, or recovery
   marker. Use synthetic target fixtures to prove placeholder reordering,
   repetition, omission diagnostics, target number formatting, long text, and
   isolation.
9. Add a development/test-only `?qaLocale=es` boot override if one does not
   exist. It must use the same provider and bundle loader as a future locale
   picker, be unavailable in production builds, and never enter game state or
   event logs. Player locale selection remains outside this migration.
10. Exercise `?goto=poolviewer` in source mode and
    `?goto=poolviewer&qaLocale=es` in target-fallback mode at one desktop and
    one narrow viewport. Cover each source/filter/sort/direction/cost branch,
    zero/one/two/larger counts, disclosure expansion, search-empty results,
    and close action. Assert URL and viewport before acting, inspect
    `window.__caps`, and inspect both visible and accessibility output.
11. Hold a go/no-go review of the generated CSV and the browser proof before
    starting Task 5. Review the artifact as a localizer would: the reviewer
    should be able to understand every row, condition, placeholder, grammatical
    relationship, and UI constraint without opening TypeScript or Fluent.

**Focused verification:** Pool Viewer component/view-model tests; Trox wrapper,
extraction, CSV preservation, bundle-load, provider, and diagnostic tests;
source parity comparison for every screen state; deterministic second
extraction/bundle generation; and the two browser workflows above.

**Proof artifacts:** the committed canonical source report, translator-ready
`localization/qa/es.csv`, generated source and allow-missing QA bundles,
task-local parity rows, captured structured diagnostics for the fallback run,
and desktop/narrow screenshots used for review. The Spanish CSV has no claimed
translation until its cells receive human review.

**Done when:** the screen is entirely Trox-authored, exact source-English parity
passes, the first CSV is localizer-ready and stable under re-extraction, both
source and target-fallback paths work through the real provider, browser QA has
no unexplained diagnostic or render error, and the go/no-go reviewer accepts
the infrastructure and message contracts. Stop and repair the slice if any
condition fails.

### Task 5: Convert lint and audit rules to understand Trox authoring

**Depends on:** Task 4. This task turns the accepted proof-slice idioms into
repository-wide enforcement before more callsites migrate.

**Objective:** Prevent new Fluent-style IDs, raw copy, hidden fragments, and
manual count grammar while callsites migrate.

**Files to change:**

- `eslint-rules/no-unlocalized-player-copy.js` and test;
- `eslint-rules/no-manual-count-copy.js` and test;
- `scripts/audit-player-localization.mjs` and test;
- `eslint.config.js`; and
- `docs/journey_prototype/localization-grammar-audit.md` in the final docs task,
  not yet.

**Implementation:**

1. Recognize direct, unaliased `tx`/`txa` patterns, their inline selector arms,
   inline argument object, and literal descriptions as localized authoring.
   Do not permit `localize("raw English")` or arbitrary strings merely because
   a resolver appears above them.
2. Reject wrapper authoring APIs, aliased Trox constructors, prebuilt patterns,
   prebuilt/spread argument maps, computed descriptions, host interpolation in
   source patterns, and localized-value concatenation.
3. Update count diagnostics to require Trox cardinal or ordinal selection when
   grammar depends on the value. Do not demand `plural` for numeric display
   which does not govern grammar.
4. Add targeted lint for resolving outside classified presentation boundaries,
   implicit coercion, string comparison, and generic JSON serialization of a
   `LocalizedString` where static analysis can prove it.
5. Keep the current zero-baseline player-copy scope. A mixed developer/player
   file receives narrow reason-bearing suppressions only around demonstrably
   excluded nodes.

**Tests:** valid direct `tx`/`txa`/nested selector examples and invalid raw JSX,
fragments, concatenation, aliases, wrappers, spreads, prebuilt patterns,
computed descriptions, manual plural/ordinal copy, and early resolution.

**Done when:** the rule suite expresses the Trox authoring contract, still
rejects every previously protected raw-copy construction, and adds no broad
file or directory baseline.

### Task 6: Migrate application shell, cooperative gates, and non-persisted descriptors

**Depends on:** Tasks 3–5.

**Primary files:**

- `src/App.tsx`;
- `src/components/BattleSiteRoute.tsx`,
  `LocalizedErrorBoundaryFallback.tsx`, and
  `JourneyUtilityMenuController.ts`;
- `src/coop/RoomGate.tsx`, `ConfigGateScreen.tsx`,
  `VersionGateScreen.tsx`, `UnreadableRoomScreen.tsx`, `BounceToast.tsx`,
  `HostedPlaytestShell.tsx`, and `hooks.ts`;
- `src/cumulus/screens/ApplicationStateScreen.tsx`;
- `src/cumulus/components/hud/CoopPresenceStatus.tsx`;
- `src/screens/cumulus_adapters/main-menu-view-model.ts`;
- `src/cumulus/screens/MainMenuScreen.tsx`; and
- all focused tests for those files.

**Implementation:**

1. Replace each non-persisted descriptor with `LocalizedString` or, when the
   screen already owns the full semantic state, keep only the state enum and
   author the message in the screen.
2. Migrate bootstrap/loading/failure, Firebase configuration, battle-preview
   failure, ErrorBoundary, room creation/join/loading/failure, configuration
   comparisons, version/unreadable gates, bounce causes, hosted playtest, and
   presence messages.
3. Preserve technical details, room IDs, hashes, and config IDs as separate raw
   fields. Trox messages own the surrounding human explanation.
4. Use host branching for independent application states and actions. Use one
   grammatical Trox family for presence count and for any expected/actual
   relationship translators must see together.
5. Migrate main-menu title/action/social values. Decide duplicate labels such
   as Dreamtides, Retry, Close, and New Journey with the meaning-key audit,
   rather than reusing them by English coincidence.
6. Replace bounce-message refs with in-memory `LocalizedString`; no fold state
   changes in this task.

**Semantic checks:** presence `0/1/2/5`; opaque room IDs; every config row kind;
all application-state kinds; every bounce reason; all retry/new-game action
states; title/action duplicate meanings.

**Tests:** state kind and action semantics, nonempty resolution under source and
synthetic target bundles, technical-detail separation, no raw ID leakage, and
no English test selector.

**Done when:** these surfaces have no Fluent import/ID/descriptor and resolve
Trox values only at browser/React presentation sinks.

### Task 7: Migrate Journey chrome, decks, cards, pools, and shared controls

**Depends on:** Tasks 3–5. May run in parallel with Task 6 after shared
runtime files settle.

**Primary files:**

- `src/components/DreamscapeJourneyMenu.tsx`;
- Journey start, loading, status, completion/failure, tutorial, and viewport
  screens/components;
- `src/cumulus/components/hud/{JourneyStatusBar,DreamAvatarPortrait,DreamAvatarStage,Dreamsign,TideDisc,TidesInfoLabel}.tsx`;
- `DesktopDeckViewer.tsx`, `MobileDeckViewer.tsx`,
  `CardZoneBrowserOverlay.tsx`, and deck filter/sort helpers; Pool Viewer is
  already migrated by Task 4;
- `CardChoiceGrid.tsx`, `CardStatOrb.tsx`, `CardView.tsx`, `PlayingCard.tsx`,
  `RulesText.tsx`, `card-gallery-surface.tsx`, and
  `glossary-info-card.ts`;
- `CommandMenu.tsx`, `InfoCard.tsx`, `TutorialFeatureCallout.tsx`,
  `CharacterDialogue.tsx`, `TransientStatusToast.tsx`, and
  `RadialAnnouncement.tsx`; and
- associated adapters and tests.

**Implementation:**

1. Migrate menu, save/load, build SHA, Journey start/status/results, tutorial
   labels, remaining deck/pool diagnostics, card metadata, glossary fallbacks,
   shared controls, and all accessible counterparts. Preserve the accepted
   Pool Viewer contracts and rerun its focused proof after shared changes.
2. Keep option values and behavior semantic. Filters whose keys are `"0"` to
   `"4"` remain string `select` branches. Sort/filter labels do not flow back
   into comparison or state logic.
3. Trace every remaining count independently: deck size, Dreamsign capacity,
   completed stats, memory/point counts, and connected entity counts. Use
   selector-only counts where the number renders elsewhere. Reverify the Pool
   Viewer's separately named visible/total values without redesigning them.
4. Treat card type/subtype, Avatar/Dreamsign/Tide names, rules text, and glossary
   data as RON-owned scalar values. Do not add articles or infer agreement.
5. Use `ordinal` for true ordered positions after verifying the callsite
   domain. Keep IDs and resource amounts cardinal.
6. Replace message descriptor fields in `InfoCard` and tutorial specs with
   `LocalizedString` fields. Preserve raw authored RichText separately.

**Tests:** all semantic option unions, valid count probes, source/target number
formatting, placeholder reorder, authored-data passthrough, accessible
association, and UI behavior by IDs/data attributes.

**Done when:** card/deck/Journey/shared-control production paths contain no
Fluent reference and no preformatted player grammar in non-presentation models.

### Task 8: Migrate site flows except Exploration

**Depends on:** Tasks 3–5.

**Primary files:**

- `BattleStartScreen.tsx`;
- `AugurySiteScreen.tsx` and `AugurySiteScreenAdapter.tsx`;
- `CardShopSiteScreen.tsx`, `ShopFreePurchaseStatus.tsx`,
  `DraftScreen.tsx`, `DreamsignBazaarSiteScreen.tsx`,
  `DreamsignRevelationScreen.tsx`, `DreamsignReplacementDialog.tsx`,
  `PurgeSiteScreen.tsx`, `DuplicationSiteScreen.tsx`,
  `TransfigurationSiteScreen.tsx`, and `GambleSiteScreen.tsx`;
- `TransfigurationButton.tsx` and `PlayingCard.tsx` Gamble presentation;
- `src/screens/cumulus_adapters/augury-view-model.ts`; and
- focused screen/adapter tests.

**Implementation:**

1. Inventory each screen's loading, empty, selectable, invalid, confirming,
   pending, resolved, declined, and leaving states.
2. Author static controls locally. Carry `LocalizedString` only when a
   non-React adapter must choose the complete utterance.
3. Use exact zero for free Transfiguration offers and cardinal selectors for
   free-purchase counts. Treat wager/draw attempt/tier/pack numbers according to
   their ordinal semantics and actual domain.
4. Map boolean presentation facts such as enhanced, compact/full, pending, and
   has-Dreamsign to semantic `select` only when they alter one complete message;
   use host flow for separate controls or outcomes.
5. Pass gate, card, Dreamsign, form, Avatar, and site names as precisely named
   RON-owned scalars. Pass known owner/entity-kind facts separately when target
   agreement may depend on them.
6. Convert Augury validation results from Fluent descriptors to
   `LocalizedString` or stable error kinds selected by the screen.

**Tests:** every state and selector domain, count/ordinal boundaries, source
parity for visible/accessibility strings, and unchanged mutation/action/logging
semantics.

**Done when:** every non-Exploration site callsite is Trox-authored without
changing RON content or game behavior.

### Task 9: Migrate Exploration as a dedicated semantic batch

**Depends on:** Tasks 3–5. Complete after Task 8 establishes site idioms.

**Primary files:**

- `src/cumulus/screens/ExplorationSiteScreen.tsx`;
- `src/screens/cumulus_adapters/exploration-view-model.ts`;
- Exploration-specific models and focused tests; and
- the Exploration rows in the parity ledger.

**Implementation:**

1. Partition the file by semantic result family before editing: deck
   modification chips; reward/purge; next-battle modifiers; free shop/purchases;
   copies and Transfiguration; Avatar/Dreamsign changes; Nightmare and starter
   mutations; compound outcomes; card-type/replacement outcomes; pack/follow-up
   choice; Essence calculations; site insertion; and empty/fallback results.
2. Trace each count and amount independently. The large compound messages must
   never reuse a selector count for a different visible amount. Probe all valid
   zero states and document positive-only domains.
3. Preserve authored narrative, action labels, and effect text exactly as raw
   RON-owned values. Code-authored disclosures become complete Trox messages in
   their own DOM units; do not append localized suffixes to authored prose.
4. Replace `FluentMessageDescriptor` fallbacks and locally constructed
   descriptor objects with direct Trox authoring.
5. Model offered site type, card type/subtype changes, Transfiguration form,
   owner, and missing-target state semantically. Do not pass an English article
   or preformatted site phrase through a placeholder.
6. Preserve UUID-based entity reveal and action resolution. Resolve names only
   for display.
7. Inspect target row expansion after each outcome family. Prefer multiple
   complete UI/accessibility units over selector cross-products which do not
   represent a real grammatical relationship. Any entry above Trox's human-row
   expansion warning threshold needs an explicit translator-cost review and a
   reasoned lint policy, not a blanket suppression.

**Tests:** one semantic test per result family and finite branch; numeric probes
for each independently governed count; authored text passthrough; UUID-based
interaction; synthetic Russian/Arabic/Japanese resolution; accessible names;
and no raw placeholder/entry-ID leakage.

**Done when:** all Exploration-localized grammar is direct Trox authoring,
authored RON text is untouched, and the parity ledger covers every outcome and
accessibility branch.

### Task 10: Rebuild reveal and accessibility composition from complete units

**Depends on:** Task 7 for shared message types.

**Primary files:**

- `src/cumulus/internal/reveal/context.tsx` and model files;
- `RevealOverlay` and reveal-source tests;
- `RulesText.tsx`, `glossary-info-card.ts`, and `InfoCard.tsx` integration;
- GameCard, InfoCard, definition-stack, Tide, and gallery reveal tests; and
- accessibility QA helpers.

**Implementation:**

1. Replace `joinDescriptionParts`, `reveal-description-join`,
   `reveal-list-and`, and all reductions of resolved localized strings.
2. Define semantic reveal utterance models for source text, info-card title,
   subtitle, Tide identity, glossary definition entry, game-card traits, rules
   text, and secondary cards.
3. Render an ordered set of independently complete hidden description nodes.
   Each punctuation mark and conjunction belongs to a complete Trox message;
   DOM ordering supplies only accessibility association, not English grammar.
4. Keep arbitrary-length definition and secondary-card collections as repeated
   complete utterances. Do not create an exponential selector tree or pass a
   prejoined list scalar.
5. For game-card Energy alternatives, retain a numeric array until
   presentation. Because Trox v1 has no list formatter, use a finite
   product-defined display model only where the actual card schema imposes a
   finite maximum; otherwise render repeated complete Energy-cost utterances.
6. Preserve raw card name, rarity, type, subtype, and RON rules text as separate
   authored units. Provide semantic Fast, Interrupt, Reclaim, variable-cost,
   and numeric-cost facts.
7. Verify computed accessible description text, not merely hidden DOM
   existence, against the parity ledger at desktop and mobile.

**Tests:** every reveal primary kind; no/one/many definitions; no/one/many
secondaries; all card trait presence combinations which production can create;
variable and alternative Energy; Spark/Reclaim zero and positive domains; RTL
isolation; deterministic association order; and no host-language concatenation.

**Done when:** reveal accessibility contains no localized fragment join and
every hidden node is an independently valid translator unit.

### Task 11: Replace persisted built-in battle messages with semantic prompt refs

**Depends on:** Tasks 2–5. Complete before Task 12.

**Primary files:**

- `src/data/dreamwell-prompts.ts`;
- `src/rules/battle/effect-step.ts`, `effect-runner-core.ts`, and
  `battle-card-effects-table.ts`;
- `src/rules/battle/fold.ts`;
- `src/rules/journey/lifecycle.ts`;
- `src/rules/replay/replay.ts` and replay/codec fixtures;
- `src/coop/reducer-version.ts`, Room Gate compatibility tests, and coop
  fixtures;
- `src/battle/components/battle-prompt-logging.ts`;
- `docs/journey_prototype/firebase_multiplayer.md` in Task 13; and
- all prompt, fold, replay, lifecycle, and logging tests.

**Implementation:**

1. Define the closed `BuiltInBattlePromptRef` union and exact runtime validator.
   Keep arguments semantic and JSON-safe. `side` remains `player | enemy`; a
   count is a nonnegative safe integer; stable IDs remain IDs.
2. Replace built-in descriptor construction in effect tables with prompt-ref
   constructors. Do not import Trox authoring into reducer/effect logic.
3. Keep `DreamwellPromptRef` resolution and RON interpolation unchanged. Keep
   `LegacyPromptText` only for explicit imported compatibility data.
4. Increment the reducer protocol to `dreamtides-coop-v25` in the same coherent
   change. Keep the compatible legacy set empty and prove v24 gates before any
   log client/fold/append work.
5. Update `LOAD_STATE` normalization to accept known v24
   `{id, variables}` Fluent descriptors and older string prompts, convert them
   to semantic refs or the existing safe legacy shape, and reject malformed
   arguments. This normalization is not used for v24 room compacted state.
6. Update current compaction/replay codecs and fixtures to round-trip each
   prompt-ref variant exactly.
7. Change logs to record prompt kind, built-in ref variant, arguments,
   Dreamwell card UUID/key/part, candidates, counts, option index, and final
   resolution. Delete Fluent message ID/argument log fields.

**Tests:** compile-time and runtime construction, every prompt kind and option,
v25 current/v24 incompatible classification, early Room Gate stop, current
snapshot encode/decode, live-event replay, known/unknown/malformed `LOAD_STATE`
normalization, deterministic fold equality, and reconstruction logging.

**Done when:** folded/current battle state contains semantic prompt refs and no
Fluent descriptor, v24 rooms gate, explicit imports normalize safely, and logs
remain reconstructable without rendered text.

### Task 12: Migrate battle presentation and overlays

**Depends on:** Tasks 7, 10, and 11.

**Primary files:**

- `src/screens/cumulus_adapters/mobile-battle-view-model.ts`;
- `src/cumulus/screens/MobileBattleScreen.tsx`;
- `src/battle/components/PlayableBattleScreen.tsx` and
  `BattleDeckOrderPicker.tsx`;
- battle status, piles, Dreamwell, result, tutorial guidance, Foresee, zone
  browser, note, deck-order, history, and normal player overlays;
- `src/cumulus/components/status/RadialAnnouncement.tsx`; and
- focused battle tests.

**Implementation:**

1. Add a presentation-only function mapping `BuiltInBattlePromptRef` to direct
   `tx`/`txa` calls. RON Dreamwell prompt refs continue resolving through the
   pinned Dreamwell catalog and remain separate from Trox authoring.
2. Keep prompt refs through the mobile view model. Resolve at the screen. Never
   send resolved labels back through prompt actions or logs.
3. Redesign picker progress so a Trox value is never resolved and interpolated
   into another Trox message. Built-in prompts may use a complete combined
   message selected from the semantic ref. Dreamwell prompt instructions and
   localized progress metadata render as separate complete units.
4. Migrate zone owner/title/count, phase/participant status, pile/challenger,
   results, flow actions, merge controls, tutorial errors, note editor,
   deck-order, Dreamwell history, Foresee, picker/choice controls, and all
   accessibility copy.
5. Audit owner/person and side semantics explicitly. Viewer/opponent, player/
   enemy, active side, candidate owner, and card owner are not interchangeable.
6. Audit true ordinal values such as turn headings and face-down positions.
   Audit card/turn counts independently from score, Energy, Spark, and resource
   amounts.
7. Keep inspector, AI approval, context menu, figment creator, and developer
   controls within their existing exclusions. Mixed files use narrow
   reason-bearing lint suppressions.

**Tests:** all battle phases/outcomes/owners/zones, prompt kinds and sides,
counts and ordinals, source and target resolution, option resolution by index,
card behavior by UUID/instance ID, replay/log invariants, accessible output,
and no resolved string in actions/state/logs.

**Done when:** every normal battle-player Fluent callsite is Trox-authored and
the battle state/presentation separation remains deterministic.

### Task 13: Delete Fluent and make Trox the only localization workflow

**Depends on:** Tasks 6–12.

**Files to delete:**

- every `.ftl` file under `data/locales/en-US/` and its `manifest.json`;
- `scripts/fluent-format.mjs`;
- `scripts/format-fluent.mjs` and test;
- `scripts/generate-localization-types.mjs` and test;
- `scripts/validate-localization-source.mjs`;
- `scripts/lint-localization-source.mjs` and test;
- `scripts/localization-catalog.mjs` and test;
- generated `src/data/localization-messages.ts`;
- `src/data/localization-descriptors.ts` and test; and
- the Fluent implementation in `src/data/localization.ts` after all callers use
  `src/localization/`.

**Files to change:**

- `package.json` and `package-lock.json`;
- `src/cumulus/CumulusRoot.tsx` and `src/cumulus/hooks/use-messages.ts`
  (delete or rename the hook; no ID formatter compatibility API remains);
- `scripts/regenerate-assets.sh` and test;
- `scripts/review-plan.mjs`, `review.mjs`, and tests;
- `scripts/data-driven-ui-ownership.json` and test;
- `scripts/audit-player-localization.mjs` and tests;
- Cumulus metadata and generator outputs;
- `docs/journey_prototype/localization.md`;
- `docs/journey_prototype/localization-grammar-audit.md`;
- `docs/journey_prototype/firebase_multiplayer.md`; and
- any source/test import reported by final searches.

**Implementation:**

1. Remove `@fluent/bundle`, `@fluent/react`, and `@fluent/syntax` and regenerate
   the lockfile. Add the vendored Trox runtime dependency.
2. Delete all Fluent resource, manifest, formatter, parser, generator,
   descriptor, and catalog code listed above.
3. Replace regeneration's localization-types phase with Trox extraction,
   `trox check --deny warnings`, and bundle generation. Update step counts and
   deterministic second-run tests.
4. Replace review-plan Fluent flags and steps with `shouldCheckTrox`. Any
   configured TypeScript/TSX source, `trox.ron`, locale profile/report,
   `terms.ron`, runtime integration, vendored revision, or Trox wrapper change
   selects the Trox check and relevant focused tests. Full review always checks
   Trox.
5. Replace `legacyFluentMessages` ownership inventory with semantic built-in
   battle prompt refs and verify the exact closed set.
6. Regenerate Cumulus metadata so public props describe `LocalizedString` or
   semantic message fields rather than Fluent descriptors.
7. Write documentation in current-state language: inline Trox authoring,
   semantic audit, RON boundary, CLI workflow, target CSV ownership, bundle
   loading, source fallback, diagnostics, testing, accessibility, v25 prompt
   refs, and CI commands.
8. Do not edit historical plans merely to remove the word Fluent. Current code,
   dependencies, generated artifacts, maintained docs, and executable tooling
   are the cutover authority.

**Required searches:**

- `rg --files | rg '\.ftl$'` returns no path.
- `rg -n '@fluent/' package.json package-lock.json src scripts eslint-rules`
  returns no match.
- `rg -n 'FluentMessage|createMessageDescriptor|appLocalization|getString'
  src scripts eslint-rules` returns no maintained implementation match.
- `rg -n 'format:fluent|localization-types|fluent-format' package.json scripts`
  returns no match.

**Done when:** Trox is the only maintained localization runtime/toolchain and
every `.ftl` resource is absent.

### Task 14: Complete extraction, translator review, and integrated QA

**Depends on:** Task 13.

**Objective:** Prove semantic sufficiency, source parity, deterministic
artifacts, runtime behavior, responsive/accessibility behavior, and complete
Fluent removal.

**Semantic and translator review:**

1. Run `trox extract`, then inspect every affected source and QA row. Review
   `conditions`, English, description, placeholders, source locations, status,
   and row expansion. Trace each condition back to application state.
2. Confirm every placeholder union is intentional and every target omission
   warning is investigated. Confirm shared identities have the same semantic
   argument kinds at every callsite.
3. Review all numeric families at `0`, `1`, `2`, `5`, every exact boundary, and
   maximum/minimum valid product states. Confirm selector, visible placeholder,
   and any term-form count represent the intended quantities.
4. Review all owner/side/entity-kind/speaker/form/presence selectors. Record why
   unavailable entity gender/case metadata is safely avoidable or file the
   explicit RON-localization follow-up which blocks that target locale.
5. Review duplicate identities and meaning keys. Remove cargo-cult meaning keys
   and split genuinely distinct meanings.
6. Review translator row counts. Every warning suppression has a narrow rule
   ID and nonempty translator-cost reason.
7. Run `trox check --deny warnings`, build the source bundle, build
   development-only QA bundles with allowed missing translations, and verify
   second extraction/bundle output is byte-identical.

**Automated verification:**

1. Run all focused tests named by Tasks 1–13.
2. Run `scripts/regenerate-assets.sh` and inspect every tracked artifact.
3. Run `npm run review`.
4. Run `npm run review:full` because this changes cross-cutting runtime,
   persistence, generated artifacts, lint, CI, and package dependencies.
5. Run the v25 reducer-version, Room Gate, `LOAD_STATE`, compaction, replay,
   deterministic fold, and prompt logging suites.
6. Run the final raw-copy audit with zero unclassified player-runtime result.
7. Run the required Fluent-removal searches from Task 13.
8. Complete every parity-ledger row. Any difference in source output or
   computed accessibility text is a release blocker even if Trox, TypeScript,
   lint, and tests pass.
9. Run `git diff --check` and verify generated files are synchronized.

**Browser QA:** use `/opt/homebrew/bin/agent-browser` against a non-5173 Vite
port and one unique session. Follow
`docs/journey_prototype/qa_tooling.md`: assert the exact URL and viewport before
acting, inspect `window.__caps`, use semantic selectors, and tear down only the
task's server/session.

Use the smallest state/viewport matrix which covers distinct risks:

- application bootstrap plus a recoverable app/coop gate;
- main menu/loading and `?goto=dream-avatar-select`;
- `?goto=dreamscape`, `?goto=deckviewer`, and `?goto=poolviewer`;
- `?goto=shop`, `?goto=augury`, `?goto=transfiguration`, and
  `?goto=exploration` with representative compound/count outcomes;
- `?goto=battle` and `?goto=battle-playable`, including a built-in picker,
  Dreamwell prompt, zone browser, note editor, Foresee, and result state; and
- `?goto=journeycomplete` and `?goto=journeyfailed`.

At one desktop and one narrow viewport, verify control behavior, text
visibility, clipping/overlap, long synthetic translation pressure, exact source
English, accessible names/descriptions, live announcements, and an empty
`window.__caps` error buffer. Repeat representative plural states with Russian
rules, RTL/isolation with Arabic, reordered placeholders with Japanese, and a
long-translation synthetic bundle. Check for raw placeholders, `tx1_` markers,
semantic IDs, UUID leakage, incorrect number formatting, and wrong document
direction.

Request one independent review after automated and browser QA. Give the
reviewer this plan, the parity ledger, the extracted reports, row-expansion
warnings/reasons, and the complete diff. Require review of source-copy parity,
semantic inputs, translator descriptions, persisted prompt compatibility,
resolution boundaries, Fluent removal, and target-language grammar—not merely
passing tests. Verify and fix each confirmed finding; do not request a second
independent review.

**Done when:** all automated and browser checks pass, the parity ledger is
complete, every target-language stress case is structurally supported, source
and QA artifacts are deterministic, and no material review finding remains.

## Dependency and Parallelization Map

| Task | Depends on | Safe parallel peers after dependency | Contract owner |
| --- | --- | --- | --- |
| 1. Baseline/inventory | None | None | Scope and parity evidence |
| 2. Pin/toolchain | 1 | None | Trox revision, CLI, config, artifacts |
| 3. Runtime boundary | 2 | None before proof | Localizer and diagnostics |
| 4. Pool Viewer proof | 1–3 | None; go/no-go gate | End-to-end contract |
| 5. Lint/audit | 4 | migration batches | Authoring enforcement |
| 6. App/coop/menu | 3–5 | 7, 8 | Non-persisted shell messages |
| 7. Journey/cards/decks | 3–5 | 6, 8 | Shared component messages |
| 8. Sites | 3–5 | 6, 7 | Non-Exploration site messages |
| 9. Exploration | 3–5, idioms from 8 | 10, 11 | Exploration families |
| 10. Reveal/accessibility | 7 | 9, 11 | Complete accessibility units |
| 11. Prompt protocol | 2–5 | 9, 10 | v25 semantic prompt state |
| 12. Battle UI | 7, 10, 11 | None on shared files | Battle display boundary |
| 13. Fluent cutover | 6–12 | None | Sole Trox workflow |
| 14. Acceptance | 13 | None | Integrated proof and review |

If parallel agents are used during implementation, one integration owner must
serialize `trox extract`, QA CSV synchronization, bundle generation,
`package-lock.json`, review scripts, generated Cumulus metadata, and the parity
ledger. Agents may edit disjoint callsite families, but they must not hand-edit
generated CSV or bundle rows.

## Suggested Commit Boundaries

1. Pinned Trox runtime, CLI/config, generated source bundle, and runtime
   provider.
2. Pool Viewer vertical slice, translator-ready Spanish QA CSV, proof bundles,
   and accepted go/no-go evidence.
3. Trox-aware lint/audit rules derived from the accepted slice.
4. Application/coop/main-menu migration.
5. Journey/card/deck/shared-control migration.
6. Site migration.
7. Exploration migration.
8. Reveal/accessibility migration.
9. v25 semantic battle-prompt protocol and compatibility.
10. Battle presentation migration.
11. Fluent deletion, review/regeneration/docs cutover, generated artifacts.
12. QA/remediation from the final independent review.

Each commit must preserve a buildable branch, update the relevant parity-ledger
rows, run focused tests, and regenerate Trox artifacts through the configured
workflow. Do not push a worktree branch under the repository's `wt` workflow;
promotion happens only after user approval.

## Acceptance Criteria

- No `.ftl` file, Fluent manifest, Fluent dependency, Fluent runtime/parser,
  Fluent formatter/generator/validator, Fluent message ID, or
  `FluentMessageDescriptor` remains in maintained source/tooling.
- Every in-scope player-visible or accessibility-only source-English output
  matches the starting commit for every valid semantic branch and numeric
  boundary.
- Every dynamic input has documented provenance, type, domain, visibility,
  grammar role, and target-language implications.
- Cardinal counts, ordinals, exact zero, numeric scalars, signed values, and
  numeric-looking enums use the correct distinct Trox contracts.
- Owner, side, person, entity kind, and available agreement facts are explicit.
  Entity gender/case is never guessed; target-language blockers caused by RON
  metadata are documented outside this scope.
- Every selector leaf and accessibility node is a complete translation unit.
  No localized fragment, punctuation, conjunction, article, preformatted list,
  or resolved Trox value is interpolated into another message.
- `localization/terms.ron` contains only terms justified by a runtime form,
  count, or facet operation; fixed vocabulary remains in complete messages.
- Every `tx`/`txa` call has an actionable literal translator description and an
  intentional meaning identity.
- `LocalizedString` remains unresolved through view models and resolves only at
  presentation. Behavior, logging, equality, selectors, and tests use semantic
  IDs/values.
- v25 battle state persists semantic prompt refs, v24 rooms gate before fold or
  append, explicit legacy `LOAD_STATE` imports normalize safely, and replay/
  compaction/logging remain deterministic and reconstructable.
- Source and QA reports/bundles are current, canonical, byte-stable on a second
  run, and validated by the pinned Trox toolchain.
- The Pool Viewer gate passes before bulk migration: its source English matches
  the parity ledger, `localization/qa/es.csv` is understandable without source
  code, translator edits survive extraction, and source plus target-fallback
  browser paths use the real provider without unexplained diagnostics.
- QA covers Russian plural categories, Arabic RTL/isolation, Japanese
  placeholder order, long translations, source fallback, missing/malformed
  resource diagnostics, and all representative player workflows.
- Committed tests assert stable semantic behavior rather than specific UI
  strings.
- `npm run review`, `npm run review:full`, final browser QA, and the single
  independent review complete without an unresolved material finding.

## Explicit Non-Goals

- Wrapping strings in RON with Trox `Tx`, translating RON content, or adding
  grammatical metadata to RON entities.
- Changing card, Dream Avatar, Dreamsign, Dreamwell, guide, site, glossary,
  tutorial, or Exploration-authored English.
- Shipping translated production CSVs or choosing the product's supported
  locale list.
- Adding locale negotiation, persistence, a settings control, or network bundle
  loading.
- Localizing editor, debug, inspector, operator, image-viewer, QA-fixture, or
  Cumulus documentation/demo surfaces outside the existing protected boundary.
- Changing gameplay, selection algorithms, card identity, event action shapes,
  candidate UUIDs, option indices, random sampling, or co-op synchronization
  except for the explicit v25 prompt-ref representation.
- Deploying to production.
