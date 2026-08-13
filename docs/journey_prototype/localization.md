# Localization

Dreamtides uses Trox for code-authored player text. Authors create immutable
`LocalizedString` values inline with `tx`, `txa`, selectors, and semantic
arguments from `@trox/runtime`. Trox extracts those values into translator CSVs
and deterministic runtime bundles.

## Project layout

- `trox.ron` defines source discovery, locale outputs, profiles, and lint policy.
- `.trox-revision` pins the exact Trox checkout used by CI and vendored runtime
  updates.
- `scripts/trox.mjs` invokes the current `TROX_ROOT` checkout, defaulting to
  `~/trox`, so local development follows that checkout's current branch.
- `TROX_VERIFY_REVISION=1` requires the checkout to match `.trox-revision` and
  is enabled in CI. Runtime updates require the pinned revision as well.
- `npm run trox:bump` pins the current clean `TROX_ROOT` commit, updates the
  Rust dependency and lockfile, rebuilds the vendored TypeScript runtime, and
  regenerates the localization reports and bundles.
- `localization/reports/en-US.csv` is the source-English review report.
- `localization/qa/<locale>.csv` is editable translator data for development QA.
- `localization/qa/<locale>.ron` defines locale direction, isolation, fallback,
  and grammatical facets.
- `localization/terms.ron` owns reusable lexical terms and their forms.
- `src/generated/localization/*.trox.json` contains canonical runtime bundles.
- `src/runtime/localization/` owns bundle loading, diagnostics, React context,
  source fallback, and development QA locale selection.

## The internal contract

Code-authored player copy travels through application state, view models,
component props, and persisted semantic references as `LocalizedString`.
Components resolve a message only where its resulting `string` is passed to an
intrinsic browser boundary such as a text node, `aria-label`, `alt`,
`placeholder`, or document metadata.

`useLocalizer()` is the React boundary API. `resolveChecked()` exists for
non-React browser sinks and tests that intentionally inspect final output.
Domain code, reducers, persistence, and view-model builders do not resolve
messages.

Canonical RON text, user input, card names, and developer diagnostics are
authored content. Components that display either ownership class expose
distinct props such as `title`/`authoredTitle` or
`placeholder`/`authoredPlaceholder`. This keeps authored strings opaque and
prevents them from being mistaken for code-authored translation units.

## Authoring messages

Use `tx(source, description)` for a complete message without arguments. Use
`txa(pattern, arguments, description)` when the message contains semantic
arguments or selectors. Descriptions explain the UI situation, the complete
meaning, and every argument whose role is not self-evident.

Source text is the source-English product contract. Keep a complete grammatical
unit in one message. Pass semantic facts such as `count`, `owner`, `side`,
`entity_kind`, or `has_title`; do not preformat fragments which a target locale
may need to reorder or inflect.

Use `meaning(key, source)` when identical English text has genuinely different
translator meaning, such as a Back navigation action versus a card's back
face. Reuse the same message identity only when meaning, argument kinds, and
translator description agree at every callsite.

Numeric grammar uses Trox cardinal or ordinal selectors. Review exact branches
and locale plural categories independently. Boolean and enum selectors should
describe product state rather than English words. Prefer complete selector
branches when a placeholder is absent in one state.

Terms belong in `localization/terms.ron` when a reusable lexical concept needs
locale-specific forms or facets. A term is not a shortcut for sharing a whole
UI sentence.

## Runtime behavior

`TroxLocalizationProvider` loads the checked `en-US` bundle synchronously. The
source runtime uses source patterns without directional isolation so source
output remains byte-stable. Target runtimes use strict resolution, source
fallback, and the isolation policy in their locale profile.

Development builds accept `?qaLocale=ar`, `es`, `ja`, or `ru`. The provider
dynamically loads the matching QA bundle and updates the document `lang` and
`dir` attributes. Missing target rows fall back to the source bundle and emit a
deduplicated `trox_resolution_diagnostic` journey-log event. Bundle load outcome,
locale, direction, and source-catalog fingerprint are logged as
`trox_bundle_loaded`.

A catastrophic source-bundle failure renders the fixed bootstrap sentence
`Unable to display localized content.` because localization is unavailable at
that boundary.

## Persistence and multiplayer

Persisted battle prompts use semantic JSON-safe references. Built-in prompts
store a closed `kind`; Dreamwell prompts store their Dreamwell card UUID.
Reducers and replay code retain these references and finite semantic values.
The Cumulus adapter constructs `LocalizedString` values at presentation time,
and the browser boundary resolves them for the active locale. Option indexes,
prompt cursors, hashes, and fold behavior are language-independent.

Version-24 snapshots are normalized while loading into the version-25 prompt
reference shape. Newly serialized application and coop state uses version 25.

## Translator workflow

1. Author or edit inline Trox messages.
2. Run `node scripts/trox.mjs extract`.
3. For a target locale, run `node scripts/trox.mjs extract --locale <locale>`.
4. Review source, description and its `Conditions:` context, placeholders,
   status, source locations, and every expanded row in the CSV.
5. Edit the target `translation` cells without changing identities or source
   signatures.
6. Run `node scripts/trox.mjs check --deny warnings`.
7. Run `node scripts/trox.mjs bundle --allow-missing` for development QA
   bundles.

`trox.ron` denies warnings by default. Each allowed diagnostic names one narrow
rule and carries a nonempty review reason. The current exceptions cover
intentional leading-plus delta labels, complete selector branches which omit an
inapplicable placeholder, and the reviewed 12-row accessible battle participant
summary.

Use `node scripts/trox.mjs prune` when obsolete translator rows have been
reviewed and should be deleted. Locale-specific pruning accepts `--locale`.

## Verification

`scripts/regenerate-assets.sh` runs extraction, validation, and bundle
generation after the other repository generators. `npm run review` selects the
Trox check for configured source, runtime, catalog, profile, wrapper, or vendored
runtime changes. `npm run review:full` includes Trox validation, deterministic
generated-bundle checking, lint, typecheck, and the complete test suite.

Localization tests use real Trox bundles. Synthetic target translations are
added with `withSyntheticTranslations()` against stable message identities;
tests assert behavior and structure rather than message IDs or specific UI
wording.
