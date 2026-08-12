---
name: localization
description: Use when adding, editing, reviewing, or migrating player-facing Dreamtides text with Trox, including tx/txa/Tx authoring, LocalizedString integration, placeholders, plural or semantic selectors, terms and forms, translator descriptions, trox.ron, locale profiles, CSV translation workflow, bundles, localization QA, and audits for hard-coded or preformatted UI copy. Triggers on localization, internationalization, i18n, l10n, translation, Trox, placeholders, plurals, grammatical agreement, locale-aware copy, and translator context.
---

# Localization with Trox

> [!WARNING]
> Existing player-facing source English is immutable unless the user explicitly
> authorizes a separate copy change. A localization task may move, parameterize,
> or restructure existing copy, but it must preserve the exact rendered wording
> for every state, including capitalization, punctuation, meaningful whitespace,
> interpolated values, accessible names, and accessible descriptions. If exact
> parity is impossible, stop and report the conflict instead of changing the
> text to satisfy Trox, lint, tests, types, or selector design.

Trox extracts complete English messages from Rust, TypeScript/TSX, and static
RON, expands target-locale translation rows, and builds deterministic source
and target bundles. Application code carries immutable, locale-independent
`LocalizedString` values everywhere code-authored player-facing text travels.
An explicit `Localizer` resolves them only when the resulting string is passed
directly to the final platform primitive which displays or announces it.

> [!WARNING]
> A React component, screen, adapter, controller, view model, option builder, or
> accessibility model is not a localization boundary. Do not call
> `resolve(tx(...))` to satisfy a string-typed component prop. Change that prop
> and every intermediate text-bearing contract to `LocalizedString`, then
> resolve inside the leaf which assigns the intrinsic DOM or platform text
> primitive.

Treat every placeholder as a semantic API. Trox checks syntax and structure;
it cannot prove that the input code supplies the value the message actually
means.

## Read the current contract

Before changing Trox authoring or infrastructure, read:

- `~/trox/README.md` for the system overview and CLI workflow;
- `~/trox/TROX_EVOLUTION.md` for implementation-driven corrections;
- the relevant authoring, placeholder, selector, term, runtime, and CLI sections
  of `~/trox/TROX_DESIGN.md`;
- the matching Rust, TypeScript, or RON examples and authoring checklist in
  `~/trox/TROX_SYNTAX_EXAMPLES.md`.

When prose and implementation disagree, verify behavior against `~/trox` source
and tests. Do not promise diagnostics or fallback behavior that only appears in
design prose. Generate current artifacts before treating fixture CSVs as
normative.

Within the project, inspect the nearest `trox.ron`, the relevant source call
sites and data model, `terms.ron`, affected locale profiles, current locale CSV
rows, bundle loading, and the display boundary. Read `data/glossary.toml` when a
canonical Dreamtides concept appears, but do not assume glossary membership
justifies a Trox term.

## Preserve source-copy parity

Before a migration, record the exact pre-change English output in a task-local
parity ledger. Inventory every finite semantic branch and representative valid
numeric state, including zero when it can occur. Include visible strings,
headings, controls, empty states, errors, notifications, tooltips, live-region
announcements, accessible names, descriptions, and meaningful image text.

After migration, compare rendered source-locale output against the ledger.
Review wording, capitalization, punctuation, interpolation order, meaningful
spacing, and line breaks independently from structural checks. Trox identity
and extraction do not prove that a migration preserved the old output.

Keep committed tests semantic and locale-neutral. Use the parity ledger and
temporary comparison output rather than tests that assert specific UI strings.
When existing copy is awkward, move it faithfully and propose any copy change
as separate work.

## Audit the input semantics first

Do not mechanically replace string interpolation with `txa`. Trace every
dynamic value to its source and determine:

1. what the player-facing value means, not merely its variable name or type;
2. whether it is raw semantic data, user-authored text, a stable ID, a
   `LocalizedString`, or already formatted/localized text;
3. its complete domain, including zero, negative, fractional, missing, unknown,
   and forward-compatible values where relevant;
4. whether it controls grammar, appears visibly, or does both;
5. whether a locale may need case, number, gender, noun class, articles,
   classifiers, agreement, or different word order;
6. whether the current branch is a grammatical choice or ordinary product/game
   control flow.

Never trust an existing placeholder, formatter, or helper simply because the
English output looks correct. Question hidden assumptions such as:

- a preformatted string containing an English article, noun, count, punctuation,
  list, date, currency, percentage, unit, or sentence fragment;
- a label that is already pluralized or localized before it reaches Trox;
- a boolean intended to render as player-facing `true` or `false`;
- a name assumed to provide grammatical gender or a form of address;
- a fixed English word order implied by concatenation or placeholder position;
- a count variable whose name disguises whether it is actual, required,
  remaining, maximum, selected, or display-only.

For every numeric message, independently verify the relationship among:

- the value passed to `plural(...)` or `ordinal(...)`;
- the value bound to each visible count placeholder;
- the value passed to `counted(...)` or another numbered term form.

Trox validates each role but does not prove that they represent the same
quantity. Use the same value only when the product semantics say they are the
same; otherwise name and describe each value distinctly. Confirm that a
selector-only count should remain hidden and that a visible count is bound
separately. `counted(term_id, count)` inflects a term but does not render the
number.

Numeric roles have different runtime contracts. A scalar number placeholder
may contain any finite number, including a negative or fractional value.
`plural(...)`, `ordinal(...)`, exact branch keys, and numbered term forms accept
only nonnegative integers no greater than `2^53 - 1`. Do not force a signed or
fractional product value into a numeric selector; model its semantic branch
separately.

Manual inventory remains mandatory. Do not assume `trox check` detects every
hard-coded UI string, localized concatenation, manual count branch, visible
boolean, or suspicious preformatted phrase.

## Design complete messages

> [!WARNING]
> Treat `select()` as an exceptional localization primitive, not as a convenient
> way to map application values to UI copy. Use it only when the selector value
> is strictly required as unresolved localization input: translators must see
> the alternatives as one message family to preserve a grammatical or semantic
> relationship that cannot be represented by independent complete messages.
> If ordinary application control flow can choose the message before it is
> constructed, use that control flow to return the appropriate complete
> `tx(...)` or `txa(...)` value. Branches that intentionally present the same
> message may reuse one call.

> [!WARNING]
> Treat `meaning(...)` as an exceptional translation disambiguator, not as a
> semantic tag, message ID, product-state label, or way to silence a catalog
> warning. Use it only when identical source English appears in translator-
> visible contexts that may legitimately require different translations in at
> least one target language. Before adding a meaning key, name the target
> language and the plausible translations that must differ. If no such example
> exists, reuse one message identity.

- Make every message and every selector leaf a complete semantic utterance or
  complete UI label. Keep articles, verbs, nouns, pronouns, punctuation, and
  word order together.
- Keep fixed vocabulary literal in the complete message. Do not pass translated
  fragments, punctuation, articles, prepositions, conjugated verbs, or already
  pluralized labels as scalar arguments.
- Use `tx(pattern, description)` when no visible placeholder appears, including
  a justified selector whose input is not displayed.
- Use `txa(pattern, inline_arguments, description)` whenever any leaf contains
  a visible placeholder. The argument keys must exactly equal the union of
  placeholders across all leaves.
- Use `meaning(...)` only to disambiguate identical English whose
  translator-visible sense or grammar may require different target text, such
  as noun and verb senses. Hidden enum cases, application states, destinations,
  analytics categories, implementation provenance, or different click outcomes
  do not justify separate meanings when the visible phrase has the same sense,
  role, and grammatical context. A meaning key never replaces a translator
  description.
- When multiple controls or enum cases intentionally display the same label,
  share one message identity. If the shared label is misleading for some cases,
  propose a source-copy change separately; do not use `meaning(...)` to let
  target translations silently repair or diverge from the immutable source
  English.
- Use ordinary host-language control flow for enum-to-label mappings,
  independent actions, tabs, filters, sort choices, screens, outcomes,
  permissions, and game decisions. Give branches separate complete Trox calls
  when their player-facing messages differ. Reuse one Trox message when
  multiple branches intentionally show the same phrase with the same
  translator-visible meaning and context. Do not use `select()` merely to
  consolidate related labels, avoid a switch, share a fallback, or reduce
  call-site code.
- Before authoring `select()`, state what unresolved selector input the locale
  needs and what translator-visible relationship would be lost if host-language
  control flow returned independent messages. If there is no concrete answer,
  do not use `select()`.
- A product enum choosing among self-contained labels or sentences is not, by
  itself, localization input. A selector is justified only when the alternatives
  form one translation unit whose grammar or meaning must remain coupled at
  localization time. Prefer `plural()` or `ordinal()` over `select()` when the
  relationship is locale-dependent numeric grammar.
- Use `plural` and `ordinal` for locale-dependent numeric grammar, always with
  `other`. Use `exact(0, ...)` only when zero has deliberate product wording;
  exact zero is separate from plural grammar.
- Expect nested selectors, terms, and locale facets to create a translation-row
  cross-product. Review translator cost instead of suppressing expansion
  warnings reflexively.

Code patterns, descriptions, selector branches, and argument maps must stay
inline at the direct Trox call site. Trox scans source lexically rather than
using the host compiler. Do not use aliases, wrapper authoring APIs, prebuilt
patterns, prebuilt argument objects, spreads, computed keys, host template
interpolation, concatenated literals, or computed descriptions.

RON authoring is deliberately static:

```ron
Tx(
    text: "Close deck browser",
    description: "Accessible button label that closes the deck browser.",
)
```

RON `Tx` supports one flat complete message plus optional `description` and
`meaning`. It does not support placeholders, arguments, selectors, terms, or
nested Trox constructors. Put dynamic content in Rust or TypeScript.

## Question every placeholder

Placeholder names use lowercase ASCII snake case, begin with a letter, and
contain at most 64 ASCII characters. Use semantic names such as
`opponent_name`, `selected_count`, or `required_count`; avoid vague names such
as `name`, `item`, `text`, `thing`, `data`, or `value`. Escape literal braces as
`{{` and `}}`.

Placeholder spelling is message identity. Renaming an existing placeholder
creates a different entry and can obsolete translator history even when the
rendered English is unchanged. Improve a vague name only after reviewing that
impact. Use `meaning(...)` only when a translation-relevant difference requires
distinct identities, not merely because application semantics differ.

For each placeholder, document and verify:

- its meaning and provenance;
- its argument kind: scalar, term, or atomic opaque localized value;
- its runtime type and allowed values;
- whether zero or absence is possible;
- whether it is safe for a translator to move, repeat, or omit;
- whether grammar requires a term form or an explicit semantic selector.

The placeholder set belongs to the whole message family. One source leaf may
omit a declared placeholder, and a target row may move, repeat, omit, or use any
placeholder declared by the entry. Unknown target placeholders are errors;
omission is a warning because it can be intentional. Investigate an omission
warning. Never add an irrelevant interpolation or rewrite source copy merely to
silence it.

Bare scalars may be Unicode text, finite numbers, or booleans. Trox formats
numbers with bundle data but provides no v1 currency, percentage, date, unit,
list, rounding, or custom-number styles. Do not interpolate a visible boolean;
use host-language control flow to choose complete messages. Use semantic
`select()` for a boolean only when the boolean is strictly required as
unresolved localization input under the exception above. If a required
formatter is outside Trox's contract, stop and design that boundary explicitly
rather than smuggling preformatted English through a placeholder.

The extractor classifies every bare binding as the same coarse `scalar` schema;
it does not infer whether host code supplies text, a number, or a boolean. Two
call sites sharing one message identity can therefore pass schema compatibility
while giving the same placeholder different runtime kinds or meanings. Find and
audit every call site that shares the extracted message. Add a stable
`meaning(...)` discriminator only when the uses may legitimately translate
differently; otherwise align their placeholder contract and description.

## Use terms and opaque values narrowly

Terms are for runtime-varying concepts that require a requested grammatical
form, cardinal inflection, or locale-owned facet. They are not a central
dictionary for every game word. Ask, “What runtime grammatical operation
requires this term?” If there is none, keep the fixed word in the complete
message.

Map domain values explicitly to stable `TermId` values. Do not derive term IDs
from display names or enum spellings. Request at most one named form and follow
its configured number policy. Locale profiles own classifications such as
message-scoped gender; application code supplies the semantic term ID rather
than guessing grammar.

Use `opaque(localized_value)` only for an atomic `LocalizedString` with no
placeholders or selectors whose surface is grammatically invariant in the
containing message, such as an independently translated proper name. If the
value needs an article, case, number, or agreement, model it as a term or
redesign the complete message. Never place an English `a` or `an` before an
opaque value.

## Write translator descriptions

Every Rust or TypeScript Trox call requires a nonempty literal description.
RON descriptions may be explicit or inherit a configured path default, but
ambiguous or dynamic content needs specific context. A useful description
explains the applicable parts of this contract:

- **Placement and role:** surface and whether the unit is a title, action,
  status, narration, tooltip, live announcement, or accessibility label.
- **Meaning and consequence:** what the player sees, does, gains, loses, or
  confirms; explain specialized Dreamtides meaning.
- **Participants and grammar:** actor, action, object, referents, tense, tone,
  and agreement data hidden by English.
- **Variables and selectors:** what each input represents, its type and domain,
  whether zero is possible, whether it is visible, and a realistic example.
- **Constraints:** only genuine limits such as a compact control, forced line
  break, or text that must match a named product concept.

Do not merely repeat the English or name an implementation component. Do not
prescribe English word order, literal translation, or English capitalization.
Descriptions affect source revision; changing one deliberately stales rows for
translator reapproval. When identical messages share one translation identity,
write one accurate description of their shared translator-visible role. Do not
invent meaning keys merely to retain call-site-specific descriptions or silence
`trox.multiple-descriptions`; first determine whether translators actually need
different target text.

## Keep `LocalizedString` to the final platform primitive

Use `LocalizedString` for code-authored player-facing copy at every in-memory
layer: helpers, view models, adapters, controllers, screen models, component
props, nested option/menu/accessory/dialog models, overlays, events, accessible
names and descriptions, placeholders, tooltips, errors, notifications, and
announcements. Label and message helpers return `LocalizedString`, never a
resolved `string`. Composite components forward localized values unchanged.

Every production component prop representing code-authored player-facing text
must accept `LocalizedString`. This includes static copy and nested fields such
as `options[].label`, `rightAccessory.button.label`, dialog titles, empty-state
labels, placeholders, alt text, and `aria-*` content. A string-typed child API
is a contract defect to migrate, not permission for the caller to resolve
early. Do not add `string | LocalizedString`, a generic `TextLike`, implicit
coercion, or a compatibility formatter. Tests, fixtures, and documentation
demos adapt to the production localized contract rather than widening it.

During an incremental migration, import Trox's shipped
`assertLocalized(sourceText): LocalizedString` directly from `@trox/runtime`
only at the semantic source of code-authored player copy which has not received
its proper `tx`/`txa` authoring pass. It is explicit, searchable localization
debt: preserve the source text, keep the returned value unresolved through
every component layer, report every production call in localization audits,
and drive the call count to zero. Do not alias or wrap it, and do not use it
inside a component to hide a string-typed prop. Projects must pin and vendor a
Trox revision which exports the helper; never create an application-owned
version.

Never use `assertLocalized` for canonical RON-authored content, user-authored
text, stable IDs, URLs, or technical diagnostics. Those are deliberately raw
semantic values and retain separately named raw contracts.

Resolve only in the same expression which hands the result to the final
platform primitive. In browser TypeScript this means an intrinsic DOM text node
or attribute, a browser API such as `document.title` or `window.prompt`, or a
browser-owned canvas/accessibility text sink. A component which renders both
intrinsic DOM and child components may resolve only the values assigned to its
own intrinsic elements; values passed to children remain `LocalizedString`.
Equivalent native or Rust UI code resolves only when assigning the final native
text property.

Never store resolved player-facing text in a local variable, object field,
option model, view model, event, callback payload, cache, or return value. Never
resolve merely because code runs in React or in a file named `screen`,
`component`, or `presentation`. Never return resolved text from a helper or
pass it to another component. If a third-party widget only accepts strings,
isolate it behind a leaf adapter and resolve at the exact call which hands text
to that final renderer.

Canonical RON-authored content, user-authored text, stable IDs, URLs, technical
diagnostics, and other deliberately non-localized data remain raw semantic
values. Keep them in distinct, explicitly named contracts so their `string`
paths cannot become an escape hatch for code-authored UI copy. When a reusable
leaf must accept both localized chrome and raw authored content, model those as
separate props or explicit discriminated ownership cases, never a bare
`string | LocalizedString` union.

When a localized value intentionally crosses persistence or a network boundary,
serialize it with Trox's canonical wire format and decode imported, saved,
replayed, or network values only through the configured `Localizer` or
`SourceCatalog`; generic JSON decoding cannot authorize entries, terms, or
opaque values. Prefer stable semantic references in gameplay state when copy
identity should not be persisted, then map those references to
`LocalizedString` in the presentation layer. Load the configured source and
target bundles explicitly and construct a `Localizer` in the application
context.

Use `resolveChecked` or `resolve_checked` when target-resolution failures must
remain explicit, and inspect structured diagnostics from recovering resolution.
Treat checked target resolution as the portable failure contract. Recovering
`resolve` currently differs by runtime: Rust may retain a valid target message
while recovering a missing target term form or nested opaque value inside it;
TypeScript falls back the whole message when checked target interpolation
fails. Verify and test the application's runtime before depending on
placeholder-level recovery. Diagnostic hooks are observational logging
boundaries and must not throw or panic.

Trox resolves configured parent locales while building the target bundle. The
runtime loads one flattened target bundle plus the source bundle; it does not
discover, negotiate, download, or walk parent locales. When recovering
resolution falls back to a source message, numeric placeholders still use the
target bundle's number format while source-fallback term surfaces come from the
source bundle.

Do not concatenate, template-interpolate, parse, compare, or implicitly coerce
localized values. Do not use resolved text as an identifier, map key,
control-flow signal, analytics dimension, or test selector. Keep UUIDs and
other stable semantic IDs in game logic and resolve names only at the final
display primitive.

## Run the Trox workflow

Use the project's configured CLI invocation; do not invent a package-install
command or assume a global binary.

1. When configured artifacts should be current, run
   `trox check --deny warnings` for a clean baseline before editing. After
   source changes, use `trox check` diagnostically and expect
   `trox.csv-out-of-date` until extraction synchronizes affected CSVs.
2. Run `trox extract`, or `trox extract --locale <locale>` for intentionally
   scoped work. Extraction synchronizes CSVs transactionally and preserves
   translations, notes, workflow columns, and stale suggestions. Target-locale
   CSVs retain obsolete rows for explicit review; the source report contains
   active rows only.
3. Inspect affected CSV rows. Pay special attention to `english`, `description`
   (including its `Conditions:` context), `placeholders`, `status`,
   `previous_translation`, and source locations. Confirm branches, selector
   inputs, and term facets mean what the application code claims. Treat the
   condition context as translator-facing labels, not executable logic or proof
   of semantic correctness; trace selector expressions and predicates back to
   the application data model.
4. Translators edit only `translation`, `translator_note`, and approved extra
   workflow columns. Trox owns the other columns. Editing a generated English
   report does not change source code.
   Translations are plain Unicode text plus declared placeholders; they do not
   contain executable selector syntax, HTML, Markdown, or rich-text programs.
   An empty translation is missing. The exact cell `^` inherits the resolved
   translation from the immediately preceding active row of the same entry;
   preserve canonical row order and never sort the CSV casually.
5. Re-run `trox check --deny warnings`. If a warning is intentional, preserve
   the copy and semantics and use the named, reasoned lint policy. Never weaken
   data or change wording just to get a clean check.
6. Build strict production bundles with `trox bundle`. Reserve
   `--allow-missing` for development fallback. Use `trox prune` only after
   explicit review of obsolete translator work.

## Verify the experience

Run focused application tests and the repository's required review command.
Test deterministic semantic construction, branch coverage, argument/selector
relationships, checked resolution diagnostics, and bundle compatibility with
synthetic fixtures. Do not assert specific UI strings.

For runtime or presentation changes, exercise the normal player workflow in
the browser. Cover valid exact and plural states such as `0`, `1`, `2`, and a
larger count; every semantic branch; a locale with a different plural system;
an RTL locale with placeholder isolation; long translations; narrow layouts;
accessibility output; source fallback; and malformed or missing-resource
diagnostics. Check for clipping, overflow, raw placeholder or ID leakage,
incorrect number formatting, and errors in `window.__caps`.

Before finishing, confirm that:

- source English still matches the parity ledger;
- every dynamic input was traced and its assumptions were verified;
- every `select()` has a concrete, documented need for unresolved localization
  input that independent complete messages cannot preserve;
- every `meaning(...)` has a concrete target-language example where identical
  source English may legitimately require different translated text;
- selector, visible placeholder, and term-form values are semantically aligned;
- every leaf is a complete translation unit;
- every description lets a translator understand meaning, variables,
  grammatical relationships, and real constraints without reading code;
- every code-authored player-facing text contract, including nested component
  prop models, uses `LocalizedString` rather than `string` or
  `string | LocalizedString`;
- every resolver call directly assigns the final DOM/browser/native text
  primitive, with no resolved local, object field, helper return, composite
  component prop, event, or cache between resolution and display;
- every remaining raw player-visible `string` is classified as canonical
  authored content, user content, technical detail, or another deliberate
  non-localized semantic value and has a distinct contract; and
- current CSVs and bundles were generated and validated by the configured
  Trox toolchain.
