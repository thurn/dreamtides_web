# Localization

Dreamtides uses Trox for code-authored player text. Authors create immutable
`LocalizedString` values inline with `tx`, `txa`, selectors, and semantic
arguments from `@trox/runtime`. Trox extracts those values into ephemeral
reports and deterministic runtime bundles.

## Project layout

- `trox.ron` defines source discovery, locale outputs, profiles, and lint policy.
- `.trox-revision` pins the exact Trox checkout used by CI and vendored runtime
  updates.
- `scripts/trox.mjs` invokes the current `TROX_ROOT` checkout, defaulting to
  `~/trox`, so local development follows that checkout's current branch.
- `TROX_VERIFY_REVISION=1` requires the checkout to match `.trox-revision` and
  is enabled in CI. Runtime updates require the pinned revision as well.
- `npm run trox:bump` pins the current clean `TROX_ROOT` commit, updates the
  Rust dependency and lockfile, and rebuilds the vendored TypeScript runtime.
- `localization/qa/<locale>.ron` defines locale direction, isolation, fallback,
  and grammatical facets.
- `localization/terms.ron` owns reusable lexical terms and their forms.
- `.generated/localization/` receives ignored reports, QA catalogs, and runtime
  bundles when the release pipeline runs.
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

Begin every explicit description with one or more lowercase square-bracket
tags. Tags identify broad translator context such as `[accessibility]`,
`[exploration]`, `[gamble]`, `[battle]`, or `[dreamsign]`; combine them when a
message spans contexts. The prose after the tags starts with the specific role
or meaning, so the tags carry generic qualifiers such as “accessible” and
“player-facing.”

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

`TroxLocalizationProvider` loads the current `en-US` bundle synchronously. Vite
extracts and bundles the current source in a temporary workspace for local
development, tests, and builds, so canonical card-copy edits render in English
without writing localization artifacts into the checkout. The source runtime
uses source patterns without directional isolation so source
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

## Release workflow

1. Author or edit inline Trox messages or canonical RON text.
2. Run `npm run review`; Trox extraction and validation occur in a temporary
   workspace and leave the checkout unchanged.
3. Tollgate runs `npm run trox:gate` as a voting pre-promotion check in its
   disposable validation slot. The gate verifies the vendored runtime and runs
   the complete release extraction, validation, bundling, clean-regeneration,
   and canonical-localization audit contract.
4. Inspect the generated source report, descriptions and `Conditions:`
   context, placeholders, status, source locations, and expanded rows.
5. Deploy through `npm run deploy`, which runs the release generation gate
   before packaging the application.

`trox.ron` denies warnings by default. Each allowed diagnostic names one narrow
rule and carries a nonempty review reason. The current exceptions cover
intentional leading-plus delta labels, complete selector branches which omit an
inapplicable placeholder, and the reviewed 12-row accessible battle participant
summary.

## Verification

`npm run review` selects isolated Trox extraction and validation for configured
source, runtime, profile, wrapper, or vendored-runtime changes.
`npm run review:full` applies the same source-validity gate with lint,
typecheck, and the complete test suite. `npm run trox:gate` is the
pre-promotion release contract. `npm run trox:release` owns generated artifact
validation at the packaging and deployment boundaries.

`npm run trox:check` is the isolated source-validity entry point used by commit
gates. `npm run trox:check-artifacts` validates materialized release outputs and
is invoked by `npm run trox:release` after extraction.

Localization tests use real Trox bundles. Synthetic target translations are
added with `withSyntheticTranslations()` against stable message identities;
tests assert behavior and structure rather than message IDs or specific UI
wording.
