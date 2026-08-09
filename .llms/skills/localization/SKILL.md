---
name: localization
description: Use when adding, editing, reviewing, or migrating player-facing Dreamtides text or locales, including source-extracted TypeScript gettext messages, POT and PO catalogs, useGettext and formatGettext integration, Fluent messages and terms, translator comments, glossary work, plural or select logic, grammatical gender or case, articles, classifiers, conjugation, localization QA, and audits for hard-coded UI copy. Triggers on localization, internationalization, i18n, l10n, translation, gettext, xgettext, POT, PO, Fluent, FTL, translator context, plurals, grammatical agreement, and locale-aware copy.
---

# Localization

> [!WARNING]
> Existing player-facing source English is immutable unless the user explicitly
> authorizes a separate copy change. A localization or localization-infrastructure
> task may move, parameterize, or restructure existing copy, but it must preserve
> the exact rendered wording for every state, including capitalization,
> punctuation, meaningful whitespace, interpolated values, accessible names, and
> accessible descriptions. Never rewrite, shorten, delete, or “improve” existing
> copy to satisfy lint, tests, types, catalog syntax, selector design, or tooling.
> Preserve the copy and fix the implementation around it; if exact parity is not
> possible, stop and report the conflict instead of changing the text.

Create complete, translator-ready messages whose meaning survives changes in
grammar, word order, writing system, and culture. Treat translator context as
part of the feature contract.

## Understand the active localization systems

Read `docs/journey_prototype/localization.md` before editing localization code.
The repository currently has two presentation systems:

- Source-extracted gettext messages are English string literals beside their
  TypeScript display boundaries. `data/locales/gettext/messages.pot` is the
  generated template, locale translations live in
  `data/locales/gettext/<locale>/messages.po`, and generated browser catalogs
  live under `src/data/gettext-<locale>.generated.json`.
- Fluent messages remain under `data/locales/en-US` and are requested through
  `useMessages()`. Read the relevant English resource and
  `data/glossary.toml` when a canonical game concept or keyword appears.

Read [references/translator-descriptions.md](references/translator-descriptions.md)
before authoring or reviewing translator context. Read
[references/gettext-language-design.md](references/gettext-language-design.md)
for gettext work involving counts, ambiguity, agreement, gender, animacy,
case, classifiers, conjugation, names, or reusable vocabulary. Read
[references/fluent-language-design.md](references/fluent-language-design.md)
for equivalent work in a Fluent surface.

## Preserve source-English parity

Inventory the pre-change rendered output before a migration. Cover visible and
accessibility-only text, every finite semantic branch, and representative valid
numeric states including zero when it can occur. Compare wording,
capitalization, punctuation, interpolation order, and meaningful whitespace.

Keep repository tests semantic and locale-neutral. Use a task-local parity
ledger, temporary comparison output, and diff review to prove exact English
parity; do not commit tests that assert specific UI strings. If the source copy
needs improvement, preserve it during the migration and treat the copy change
as separate work.

## Build a semantic inventory

For every heading, control, status, empty state, error, notification, tooltip,
accessible name, and meaningful image description, determine:

1. where and when it appears and what it means in game terms;
2. the actor, object, referents, tense, mood, and tone;
3. each varying value, its type and domain, and whether zero is possible;
4. the complete set of real semantic branches;
5. genuine layout, accessibility, capitalization, or formatting constraints.

Resolve uncertainty from the implementation, data model, design, or user. Do
not make translators infer product behavior from English wording.

## Design complete translation units

- Localize complete utterances. Keep articles, adjectives, nouns, verbs,
  pronouns, punctuation, placeholders, and word order in one message.
- Pass raw semantic values, not English fragments, punctuation, articles,
  already pluralized labels, or localized strings.
- Give different meanings distinct translation units even when their English
  text is identical. Use gettext context to distinguish those meanings.
- Keep conjugated verbs with their subjects and objects. Keep counted nouns
  with all words that may agree with the count.
- Resolve names at the display boundary and keep UUIDs in game logic.
- Never use localized output as an identifier, equality key, parsing input,
  control-flow signal, analytics dimension, or test selector.

Do not create application helpers for translated fragments such as articles,
possessives, prepositions, nouns, or verb endings. An abstraction is safe when
it selects among complete messages using real domain semantics; it is unsafe
when it asks TypeScript to construct a translated sentence.

## Author source-extracted gettext

Call the gettext API directly at the TypeScript display boundary so GNU
`xgettext` can see literal arguments:

```ts
const { gettext, ngettext } = useGettext();

// TRANSLATORS: Title of the browser containing the current player's deck.
const title = gettext("Your Deck");

// TRANSLATORS: Count beneath the deck-browser title. {count} is the
// non-negative number of cards in the current player's deck and can be zero.
const template = ngettext("{count} Card", "{count} Cards", count);
const cardCount = formatGettext(template, { count });
```

Use the smallest API that expresses the message:

- `gettext(message)` for one complete message;
- `pgettext(context, message)` when identical English has distinct meanings;
- `ngettext(singular, plural, count)` for grammatical number;
- `npgettext(context, singular, plural, count)` when both context and number
  are required;
- `formatGettext(selectedMessage, variables)` after gettext has selected the
  complete translation.

Keep every extracted source message, context, and plural source form as a
string literal in the recognized call. Do not hide calls behind wrappers or
construct source text dynamically. Put a `TRANSLATORS:` comment immediately
before the call and inspect the generated POT to confirm that extraction kept
both the message and its comment. Keep literal messages at render or formatter
boundaries; persist semantic data rather than rendered gettext output.

Use named placeholders such as `{count}`, `{actor}`, and `{target}`. Give the
same placeholder set to the singular source, plural source, and every
translation form. Pass strings or numbers to `formatGettext`; it rejects
missing and unused values so source/catalog drift fails loudly. Keep locale
formatting of dates, numbers, durations, and lists separate from message
selection and pass the formatted value as one semantic placeholder.

## Model grammar from semantics

`ngettext` selects the locale's plural form; never use `count === 1` or an
English suffix helper. Treat product-specific zero wording as a separate
semantic decision from plural grammar.

Use `pgettext` context to disambiguate meaning, not as a grammatical selector.
When the product model genuinely knows a participant's role, grammatical
class, relationship, or event state, select among complete gettext messages in
a small typed formatter and document every variant. Never infer gender,
animacy, case, or pronouns from a display name. If the required grammar is not
represented by trustworthy semantic data, rephrase the complete message or
record the limitation instead of inventing an English-centric heuristic.

Gettext does not provide Fluent-style private terms or locale-authored select
expressions. Put canonical vocabulary inside complete gettext messages and
use the glossary plus translator comments to preserve meaning. Do not extract a
shared noun fragment merely to imitate a Fluent term.

## Write translator descriptions

Give every new or changed unit enough context to translate without reading the
source. Describe the applicable parts of this contract:

- placement and role in the player experience;
- meaning, consequence, actor, object, referents, tense, mood, and tone;
- every placeholder or selector input, including type, allowed values, whether
  zero is possible, and a realistic example when useful;
- specialized Dreamtides meaning and the applicable glossary concept;
- only genuine layout, markup, line-break, or accessibility constraints.

For gettext, begin the adjacent source comment with `TRANSLATORS:` so
`xgettext` copies it into the POT. For Fluent, use `#` for one message or term,
`##` for a cohesive group, and `###` for resource-wide context. Never write a
comment that merely repeats the English, names only an implementation
component, demands literal translation, or prescribes English word order.

## Maintain the gettext catalogs

1. Edit literal TypeScript source messages and their `TRANSLATORS:` comments.
2. Run `npm run gettext:extract` and inspect
   `data/locales/gettext/messages.pot`. Treat the POT as generated output.
3. Merge the POT changes into each
   `data/locales/gettext/<locale>/messages.po` and edit the PO translations.
4. Run `npm run gettext:compile` to regenerate browser catalogs.
5. Run `npm run gettext:check` to verify extraction, catalog membership,
   plural source parity, placeholders, and generated output.

After all call sites for a migrated message use gettext, delete the
corresponding Fluent entry, regenerate the Fluent contract with
`npm run localization-types`, and run the repository's normal generated-asset
workflow. Keep gettext and Fluent providers available to the surfaces that use
each system.

## Verify the result

1. Compare every migrated English unit and dynamic branch with the parity
   ledger before treating lint or test success as meaningful.
2. Add focused structural or formatting tests for variables, plural behavior,
   context separation, catalog completeness, and parse diagnostics. Use
   synthetic fixtures; do not assert production UI copy.
3. Run the affected component tests, `npm run gettext:check`, and
   `npm run review`.
4. Exercise a translated catalog with `?locale=pl`. Check valid counts such as
   `0`, `1`, and `2`, long expansion, narrow layouts, accessibility output,
   untranslated-source leakage, and `window.__caps`.
5. Review descriptions independently from source values. Confirm that a
   translator can determine meaning, variable semantics, grammatical
   relationships, and real constraints without reading TypeScript.
