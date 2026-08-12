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

**Status:** Tasks 1–4 of the original plan are complete. This document plans
the remaining migration from the accepted Trox foundation and Pool Viewer
slice.

**Audited quest commit:** `ee2b487b8` (`master` on 2026-08-10)

**Audited Trox commit:** `d8428631e1a3f6c4d9d66c80737172c9941c14c7`

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
immutable `LocalizedString` values which remain unresolved through view models,
screen composition, Cumulus component props, option and accessory models,
overlays, and events. Resolution occurs only at a browser primitive: an
intrinsic DOM text node or attribute, a browser API such as `document.title` or
`window.prompt`, or a browser-owned drawing/accessibility API which accepts
only strings.

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
   revision. This revision includes the exported
   `localizationTodo(sourceText): LocalizedString` migration constructor. The
   authoritative contract is the consolidated README, implementation, and
   tests; the design/evolution/syntax paths named by the localization skill are
   absent from the repository.
   If the revision differs, compare the TypeScript authoring API, scanner,
   bundle schema, `SourceCatalog`, `Localizer`, CLI commands, and tests before
   following this plan; update the pinned runtime snapshot and this document if
   any contract changed.
3. Use the repository-required `wt` workflow. Create a fresh worktree, run
   `npm install`, and run `scripts/regenerate-assets.sh` once from that
   worktree. Record any pre-existing failure in `pre-existing-issues.txt` as
   required by `AGENTS.md`.
4. Treat the existing parity ledger and the quest commit recorded in it as the
   immutable source-English baseline. Extend its callsite and
   component-boundary coverage before migrating each remaining family.
5. Keep Fluent and Trox providers side by side only while migration tasks are
   in progress. The final cutover task deletes every Fluent path and verifies
   that the application mounts only the Trox provider.
6. Begin with Remaining Task 1. The Pool Viewer slice is the first correction
   target: remove every early `resolve(...)` introduced by the completed slice
   and use it to prove the stricter component contracts before migrating
   another family.
7. Run focused tests after each task. Run `npm run review` after each stable
   batch. This is cross-cutting runtime, lint, generated-data, persistence, and
   accessibility work, so the final acceptance pass also runs
   `npm run review:full` and one independent review.

## Original Audited Baseline

The immutable parity baseline recorded before the completed foundation had:

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

### Runtime and browser-sink boundary

The quest-owned Trox integration under `src/localization/` provides:

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

The resolver is a restricted sink capability, not a convenience formatter.
Importing or calling it is valid only in a module which directly writes the
result to an intrinsic DOM property or child, a browser API, or a browser-owned
renderer. A call is too early if the resulting `string` is assigned to a local
view-model field, returned from a label helper, placed in an option/accessory
object, or passed to another React component. Being inside a screen or React
component does not by itself make resolution legal.

### Component API boundary

Every production component prop representing code-authored player-facing copy
uses `LocalizedString`, including nested option, menu-item, accessory, dialog,
panel, overlay, toast, and accessibility models. Composite components forward
those values without resolving them. The leaf component which creates the
intrinsic element resolves the value at the exact `children`, `aria-*`,
`title`, `placeholder`, `alt`, or equivalent DOM assignment.

The minimum component contract is:

```ts
interface IconButtonProps {
  readonly label: LocalizedString;
}
```

`IconButton` resolves `label` only where it assigns the `<button>` accessible
name. A screen therefore passes `tx(...)` to `IconButton`; it never passes
`resolve(tx(...))`. The same rule applies recursively to structured props such
as `rightAccessory.button.label` and `Select.options[].label`.

This boundary has four explicit consequences:

1. Shared controls and Cumulus components migrate bottom-up before broad
   callsite migration. A string-typed child prop is a contract defect to repair,
   not permission for its caller to resolve early.
2. A component which both composes another component and directly emits DOM
   may resolve only the values sent to its own intrinsic elements. Values sent
   to child components remain `LocalizedString`.
3. Code-authored copy, accessible copy, status messages, and error explanations
   use `LocalizedString` even when they are currently static. Option values,
   IDs, test IDs, URLs, CSS tokens, and control-flow enums remain raw semantic
   values.
4. Canonical RON text, user-authored text, and technical diagnostics remain raw
   strings because they are outside Trox authoring in this migration. Components
   which mix these with localized chrome expose distinct, semantically named
   props; a raw authored-text prop is never reused for code-authored UI copy.

Tests, fixtures, and Cumulus documentation must adapt to the production
`LocalizedString` contracts rather than widening them back to `string`. Use the
existing synthetic-catalog testing support or a clearly excluded demo-only
adapter. Do not add `string | LocalizedString`, an implicit coercion, a generic
`TextLike`, or a `resolveForProps` compatibility helper.

The pinned Trox runtime supplies the migration bridge for code-authored strings:
`localizationTodo(sourceText)` constructor which returns `LocalizedString` and
preserves the supplied source text until that callsite receives a proper
`tx`/`txa` authoring pass. Its name and source location make the debt searchable;
the quest audit reports every production call, and the final cutover requires
zero calls. It is not a translation API, does not make its input translatable,
and must never wrap canonical RON content, user content, IDs, URLs, or technical
diagnostics. Those values keep their separately named raw contracts.

Quest pins and vendors the shipped Trox revision before converting shared
component contracts. Do not reproduce, wrap, or alias the helper in quest code.
Unmigrated code-authored callsites import it directly from `@trox/runtime` at
their semantic source; shared components still receive only `LocalizedString`
and therefore need no raw-copy compatibility branch.

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

`scripts/sync-trox-runtime.mjs`:

1. resolves `TROX_ROOT` or defaults to `~/trox`;
2. verifies the exact pinned commit;
3. runs the Trox package's install, typecheck, tests, and build;
4. replaces only `vendor/trox-runtime/` with the distributable package files;
5. writes the upstream revision marker; and
6. verifies a second sync is byte-identical.

`scripts/trox.mjs` is the sole quest CLI entry. It resolves `TROX_ROOT`,
verifies the pin, and runs the pinned Rust CLI with `--locked` and the root
`trox.ron`. Package scripts expose `trox:check`, `trox:extract`, and
`trox:bundle`. GitHub Checks checks out `thurn/trox` at the pinned revision into
the runner temporary directory and supplies `TROX_ROOT`; Firebase build jobs
need only the vendored runtime and committed source bundle.

### Trox project files

The completed foundation includes:

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

React view models, non-persisted controller values, screen-local helpers, and
component prop models carry `LocalizedString` directly. Rename fields from
`*Descriptor`, `*Label`, or `*Text` to `*Message` when the stronger name makes
the contract clear. Label helpers return `LocalizedString`; they never return
resolved text. Resolve only on the same expression path that assigns a DOM
text/attribute, canvas/browser-owned text sink, or browser prompt.

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

The completed foundation created a task-local machine-readable ledger outside
tracked source, plus a human audit view. Continue extending it during the
remaining tasks. One row represents one semantic callsite, not merely one
Fluent ID. Record:

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

## Completed Foundation and Mandatory Boundary Correction

The original Tasks 1–4 established the parity ledger, pinned Trox toolchain,
runtime/provider, generated artifacts, and Pool Viewer vertical slice. Those
tasks are complete and are not repeated below. Their artifacts remain the
starting contract for the remaining migration.

The Pool Viewer implementation also exposed the shallow migration pattern this
revision is designed to remove: screen code currently resolves Trox values to
satisfy string-typed composite component props. That is boundary debt, not an
approved idiom. Remaining Task 1 first migrates the shared component APIs and
then rewrites Pool Viewer so `LocalizedString` reaches the leaf DOM sinks. No
additional Fluent callsite family begins until that correction passes source
parity, typechecking, lint, focused browser QA, and generated-metadata review.

## Detailed Task Breakdown

### Remaining Task 1: Make `LocalizedString` the component API and enforce the sink boundary

**Depends on:** the completed Trox runtime and Pool Viewer slice. This task
first pins and vendors the Trox revision which ships
`localizationTodo(sourceText)`, then performs the blocking architecture
correction for every later migration task.

**Objective:** Make early resolution structurally difficult. Production
components accept `LocalizedString` for code-authored player copy, composite
layers forward it unchanged, and only leaf browser sinks may call the resolver.

**Primary files:**

- quest's `.trox-revision`, Trox sync tooling, and vendored runtime snapshot;
- `src/cumulus/components/controls/{IconButton,GlassButton,SegmentedControl,Select,TextField,TextArea,NumberStepper,DisclosureSection}.tsx`;
- `src/cumulus/components/overlay/{GlassPanel,GlassDialog,CommandMenu,InfoCard}.tsx`;
- card/gallery/HUD components and nested prop models used by Pool Viewer;
- `src/cumulus/screens/PoolViewerScreen.tsx` and its adapter/tests;
- Cumulus metadata generation, fixtures, demos, and focused contract tests;
- `eslint-rules/no-unlocalized-player-copy.js` and test;
- `eslint-rules/no-manual-count-copy.js` and test;
- a resolver-boundary rule and test, either new or factored from the existing
  localization rules;
- `scripts/audit-player-localization.mjs` and test; and
- `eslint.config.js`.

**Implementation:**

1. Pin Trox commit `d8428631e1a3f6c4d9d66c80737172c9941c14c7`,
   which exports
   `localizationTodo(sourceText: string): LocalizedString` as an explicitly
   temporary, source-preserving migration constructor. Verify its runtime,
   declaration, extraction-ignore, arbitrary-source-text, and documentation
   tests through `scripts/sync-trox-runtime.mjs`; regenerate the vendored
   package only through that script. Its values remain unresolved through
   application layers and resolve only at the ordinary final sink.
2. Teach the quest audit to report every production `localizationTodo(...)`
   call with its source location. Permit these calls only as migration debt for
   code-authored player copy and ratchet their count downward by task; require
   zero at final cutover. Reject aliases, wrappers around the helper, use on raw
   authored/user/technical data paths, and use inside component implementations
   as a substitute for a localized prop contract.
3. Inventory every production text-bearing prop reachable from Pool Viewer and
   the shared components used by the remaining migration. Classify each as
   code-authored localized copy, RON-authored content, user-authored content,
   technical detail, or a non-display semantic value. Record the classification
   in the audit rather than relying on a `string` type to imply ownership.
4. Change code-authored text props to `LocalizedString` bottom-up. This includes
   nested option labels, empty labels, panel titles/subtitles, disclosure
   titles, placeholders, icon-button accessible names, accessory models, toast
   copy, and `aria-*` models. Keep option values, IDs, UUIDs, test IDs, and
   callbacks semantic and raw.
5. Resolve inside the leaf implementation only where the result is assigned to
   an intrinsic DOM child/attribute or browser API. A composite component may
   not resolve a value merely because a child still expects `string`; migrate
   that child contract in the same change. Do not cache resolved strings, put
   them into objects, or return them from helpers.
6. Preserve distinct raw contracts for RON-authored text, user input, and
   technical diagnostics. Where one component renders both raw authored
   content and localized chrome, give the props distinct names and paths so a
   code-authored message cannot accidentally enter the raw-string path.
7. Rewrite Pool Viewer so its label helpers and option builders return
   `LocalizedString`, and its `SegmentedControl`, `Select`,
   `DisclosureSection`, `CardBrowserPanel`, panel header, search/sort controls,
   and close accessory receive unresolved values. The screen may call
   `resolve(...)` only for intrinsic DOM/browser sinks it owns directly.
8. Adapt tests, fixtures, and Cumulus documentation to the stronger production
   types through synthetic localized fixtures or an excluded demo-only adapter.
   Do not weaken a production prop to `string | LocalizedString` for test or
   documentation convenience. Regenerate and inspect Cumulus metadata so the
   public contracts advertise `LocalizedString` throughout nested models.
9. Recognize direct, unaliased `tx`/`txa` patterns, inline selector arms, inline
   arguments, and literal descriptions as localized authoring. Continue to
   reject wrapper authoring APIs, aliases, prebuilt/spread arguments, computed
   descriptions, host interpolation, localized concatenation, and manual
   count/ordinal grammar.
10. Enforce resolver placement syntactically. Permit resolution only when its
   result flows directly into an allowlisted intrinsic DOM/browser sink in the
   same expression. Reject resolved
   locals, resolved return values, resolved object fields, resolved composite
   props, compatibility helpers, implicit coercion, string comparison, generic
   JSON serialization, and resolver imports in non-presentation models.
11. Keep the protected player-copy scope at a zero baseline. Mixed developer and
   player files receive narrow, reason-bearing exclusions only around verified
   developer nodes. The audit must separately report remaining player-facing
   `string` props and resolver calls outside known sinks; neither report may be
   converted into a permanent numeric baseline.

**Tests:** valid leaf DOM text/`aria-*`/placeholder/browser API resolution;
valid multi-level `LocalizedString` forwarding; valid separately named RON raw
content; and invalid screen-to-component `resolve(tx(...))`, resolved option
objects, resolved helpers, `string | LocalizedString`, fragments,
concatenation, aliases, wrappers, spreads, computed descriptions, manual
plural/ordinal copy, coercion, comparison, and serialization.

**Focused proof:** rerun Pool Viewer source and target-fallback tests, exact
parity rows, extraction/bundle determinism, metadata generation, and desktop/
narrow browser workflows. Inspect the code and audit output for zero early
resolution in the slice; passing visual output alone is insufficient.

**Done when:** Pool Viewer contains no `resolve(tx(...))` or equivalent early
resolution, all code-authored text survives through its composite component
graph as `LocalizedString`, resolver calls are confined to verified browser
sinks, public metadata reflects the stronger types, and the lint/audit suite
prevents the shallow pattern from recurring.

### Remaining Task 2: Migrate application shell, cooperative gates, and non-persisted descriptors

**Depends on:** Remaining Task 1.

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

1. Replace each non-persisted descriptor with `LocalizedString` or, when a leaf
   component already owns the full semantic state, keep only the state enum and
   author the message at that leaf. Composite screen and adapter props remain
   unresolved.
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
7. Migrate every text-bearing shell, gate, menu, toast, and presence component
   contract encountered by this batch to `LocalizedString`. Resolve only at
   intrinsic DOM/browser assignments; never resolve to satisfy an intermediate
   `string` prop.

**Semantic checks:** presence `0/1/2/5`; opaque room IDs; every config row kind;
all application-state kinds; every bounce reason; all retry/new-game action
states; title/action duplicate meanings.

**Tests:** state kind and action semantics, nonempty resolution under source and
synthetic target bundles, technical-detail separation, no raw ID leakage, and
no English test selector.

**Done when:** these surfaces have no Fluent import/ID/descriptor, every
code-authored message crosses composite APIs as `LocalizedString`, and every
resolver call directly feeds a verified browser primitive.

### Remaining Task 3: Migrate Journey chrome, decks, cards, pools, and shared controls

**Depends on:** Remaining Task 1. May run in parallel with Remaining Tasks 2
and 4 after shared component contracts settle.

**Primary files:**

- `src/components/DreamscapeJourneyMenu.tsx`;
- Journey start, loading, status, completion/failure, tutorial, and viewport
  screens/components;
- `src/cumulus/components/hud/{JourneyStatusBar,DreamAvatarPortrait,DreamAvatarStage,Dreamsign,TideDisc,TidesInfoLabel}.tsx`;
- `DesktopDeckViewer.tsx`, `MobileDeckViewer.tsx`,
  `CardZoneBrowserOverlay.tsx`, and deck filter/sort helpers; Pool Viewer is
  corrected by Remaining Task 1;
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
   shared controls, and all accessible counterparts. Preserve the corrected
   Pool Viewer component contracts and rerun its focused proof after shared
   changes.
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
6. Replace message descriptor and code-authored `string` fields in `InfoCard`,
   tutorial specs, option models, command models, HUD models, and child props
   with `LocalizedString`. Preserve raw authored RichText separately. Resolve
   only in leaf components at their intrinsic DOM/browser assignments.

**Tests:** all semantic option unions, valid count probes, source/target number
formatting, placeholder reorder, authored-data passthrough, accessible
association, and UI behavior by IDs/data attributes.

**Done when:** card/deck/Journey/shared-control production paths contain no
Fluent reference, no preformatted player grammar in non-presentation models,
no code-authored player `string` prop, and no resolver call above a browser
primitive.

### Remaining Task 4: Migrate site flows except Exploration

**Depends on:** Remaining Task 1.

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
2. Author static controls at the semantic owner and carry every code-authored
   message as `LocalizedString` through adapters, screen models, option models,
   dialogs, and child components. Whether a value crosses React is irrelevant;
   only the final browser primitive may receive resolved text.
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
   `LocalizedString` or stable error kinds selected before the leaf renderer.
7. Migrate any site-specific component string props encountered in the batch
   to the shared `LocalizedString` contract. Keep RON-authored names and prose
   on distinct raw fields and do not use those fields for localized chrome.

**Tests:** every state and selector domain, count/ordinal boundaries, source
parity for visible/accessibility strings, and unchanged mutation/action/logging
semantics.

**Done when:** every non-Exploration site callsite is Trox-authored without
changing RON content or game behavior, and localized values remain unresolved
until intrinsic DOM/browser assignments.

### Remaining Task 5: Migrate Exploration as a dedicated semantic batch

**Depends on:** Remaining Tasks 1 and 4. Complete after the non-Exploration
site batch establishes the component and message idioms.

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
   descriptor objects with direct Trox authoring. Result-family helpers and
   view models return `LocalizedString` fields rather than resolved strings.
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
8. Migrate Exploration-specific chips, badges, result rows, accessibility
   models, and compound outcome component props to `LocalizedString`. Resolve
   only in the leaf DOM nodes which render each complete unit.

**Tests:** one semantic test per result family and finite branch; numeric probes
for each independently governed count; authored text passthrough; UUID-based
interaction; synthetic Russian/Arabic/Japanese resolution; accessible names;
and no raw placeholder/entry-ID leakage.

**Done when:** all Exploration-localized grammar is direct Trox authoring,
authored RON text is untouched, every localized result remains unresolved to a
browser primitive, and the parity ledger covers every outcome and accessibility
branch.

### Remaining Task 6: Rebuild reveal and accessibility composition from complete units

**Depends on:** Remaining Task 3 for shared message types.

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
3. Carry an ordered set of independently complete `LocalizedString` description
   nodes through the reveal model. Resolve each only in the hidden intrinsic DOM
   node which owns it. Each punctuation mark and conjunction belongs to a
   complete Trox message; DOM ordering supplies only accessibility association,
   not English grammar.
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

**Done when:** reveal accessibility contains no localized fragment join, every
hidden node is an independently valid translator unit, and reveal models and
composite components contain no resolved localized text.

### Remaining Task 7: Replace persisted built-in battle messages with semantic prompt refs

**Depends on:** the completed Trox foundation and Remaining Task 1. Complete
before Remaining Task 8.

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
- `docs/journey_prototype/firebase_multiplayer.md` in Remaining Task 9; and
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

### Remaining Task 8: Migrate battle presentation and overlays

**Depends on:** Remaining Tasks 3, 6, and 7.

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
2. Keep prompt refs through the mobile view model. Map built-in refs to
   `LocalizedString` at the presentation owner and carry those values through
   screen, overlay, picker, and control props. Resolve only where a leaf assigns
   intrinsic DOM/browser text. Never send localized or resolved labels back
   through prompt actions or logs.
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
8. Replace every battle-player `string | FluentMessageDescriptor`, resolved
   label helper, and string-typed nested option/accessory model with a
   `LocalizedString` or a semantic ref. Do not introduce
   `string | LocalizedString` during the transition.

**Tests:** all battle phases/outcomes/owners/zones, prompt kinds and sides,
counts and ordinals, source and target resolution, option resolution by index,
card behavior by UUID/instance ID, replay/log invariants, accessible output,
and no resolved string in actions/state/logs.

**Done when:** every normal battle-player Fluent callsite is Trox-authored, the
battle state/presentation separation remains deterministic, and no resolved
localized text exists above an intrinsic DOM/browser sink.

### Remaining Task 9: Delete Fluent and make Trox the only localization workflow

**Depends on:** Remaining Tasks 2–8.

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
   semantic message fields rather than Fluent descriptors. Run the final
   component-contract audit and require zero unclassified code-authored
   player-facing `string` props.
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
- the resolver-boundary audit reports no resolved local, return value, object
  field, composite prop, or non-sink module; and
- the text-prop audit reports no unclassified code-authored player-facing
  `string` or `string | LocalizedString` contract.

**Done when:** Trox is the only maintained localization runtime/toolchain and
every `.ftl` resource is absent, production component contracts carry
`LocalizedString`, and resolver access is confined to browser sinks.

### Remaining Task 10: Complete extraction, translator review, and integrated QA

**Depends on:** Remaining Task 9.

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

1. Run all focused tests named by the completed foundation and Remaining Tasks
   1–9.
2. Run `scripts/regenerate-assets.sh` and inspect every tracked artifact.
3. Run `npm run review`.
4. Run `npm run review:full` because this changes cross-cutting runtime,
   persistence, generated artifacts, lint, CI, and package dependencies.
5. Run the v25 reducer-version, Room Gate, `LOAD_STATE`, compaction, replay,
   deterministic fold, and prompt logging suites.
6. Run the final raw-copy audit with zero unclassified player-runtime result.
7. Run the required Fluent-removal, component-contract, and resolver-boundary
   searches from Remaining Task 9.
8. Complete every parity-ledger row. Any difference in source output or
   computed accessibility text is a release blocker even if Trox, TypeScript,
   lint, and tests pass.
9. Run `git diff --check` and verify generated files are synchronized.
10. Inspect every resolver call reported by the audit. Each call must directly
    feed an intrinsic DOM/browser primitive; React component membership,
    file-name allowlists, or an eventual downstream DOM use are insufficient.

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

| Remaining task | Depends on | Safe parallel peers after dependency | Contract owner |
| --- | --- | --- | --- |
| 1. Shipped Trox debt-helper pin, component API, and sink enforcement | Completed foundation | None; blocking gate | `LocalizedString` propagation and resolver policy |
| 2. App/coop/menu | 1 | 3, 4 | Non-persisted shell messages |
| 3. Journey/cards/decks | 1 | 2, 4 | Shared component messages |
| 4. Sites | 1 | 2, 3 | Non-Exploration site messages |
| 5. Exploration | 1, 4 | 6, 7 | Exploration families |
| 6. Reveal/accessibility | 3 | 5, 7 | Complete accessibility units |
| 7. Prompt protocol | Completed foundation, 1 | 5, 6 | v25 semantic prompt state |
| 8. Battle UI | 3, 6, 7 | None on shared files | Battle display boundary |
| 9. Fluent cutover | 2–8 | None | Sole Trox workflow and final boundary audit |
| 10. Acceptance | 9 | None | Integrated proof and review |

If parallel agents are used during implementation, one integration owner must
serialize `trox extract`, QA CSV synchronization, bundle generation,
`package-lock.json`, review scripts, generated Cumulus metadata, and the parity
ledger. Agents may edit disjoint callsite families, but they must not hand-edit
generated CSV or bundle rows.

## Suggested Commit Boundaries

1. Pin the shipped Trox `localizationTodo` runtime, `LocalizedString` component
   contracts, Pool Viewer boundary correction, Cumulus metadata, and
   resolver/text-prop enforcement.
2. Application/coop/main-menu migration.
3. Journey/card/deck/shared-control migration.
4. Site migration.
5. Exploration migration.
6. Reveal/accessibility migration.
7. v25 semantic battle-prompt protocol and compatibility.
8. Battle presentation migration.
9. Fluent deletion, review/regeneration/docs cutover, generated artifacts, and
   final component-boundary audit.
10. QA/remediation from the final independent review.

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
- No production `localizationTodo(...)` call remains at final cutover; each
  temporary call was replaced by a semantically audited `tx`/`txa` family.
- Every production component prop for code-authored player-facing text,
  including nested option/accessory/accessibility models, uses
  `LocalizedString`. Composite components forward it unchanged; raw RON,
  user-authored, and technical strings use distinct named contracts.
- `LocalizedString` remains unresolved through view models, helpers, screens,
  composite components, overlays, and events. Each resolver call directly
  assigns an intrinsic DOM/browser primitive; no resolved local, return value,
  object field, compatibility helper, or composite prop exists. Behavior,
  logging, equality, selectors, and tests use semantic IDs/values.
- v25 battle state persists semantic prompt refs, v24 rooms gate before fold or
  append, explicit legacy `LOAD_STATE` imports normalize safely, and replay/
  compaction/logging remain deterministic and reconstructable.
- Source and QA reports/bundles are current, canonical, byte-stable on a second
  run, and validated by the pinned Trox toolchain.
- The corrected Pool Viewer gate passes before bulk migration: its source
  English matches the parity ledger, `localization/qa/es.csv` is understandable
  without source code, translator edits survive extraction, source plus
  target-fallback browser paths use the real provider without unexplained
  diagnostics, and no screen-level resolution exists merely to satisfy a
  component prop.
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
