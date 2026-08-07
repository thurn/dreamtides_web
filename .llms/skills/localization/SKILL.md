---
name: localization
description: Use when adding, editing, reviewing, or migrating player-facing Dreamtides text or locales, including Fluent messages and terms in data/strings.ftl, useMessages integration, translator comments and descriptions, glossary work, plural or select logic, localization QA, and audits for hard-coded UI copy. Triggers on localization, internationalization, i18n, l10n, translation, Fluent, FTL, translator context, translator descriptions, plurals, grammatical gender or case, articles, classifiers, and locale-aware copy.
---

# Localization

Create complete, translator-ready messages whose meaning survives changes in
grammar, word order, writing system, and culture. Treat translator context as
part of the feature contract, not optional commentary.

## Read the localization contract

Before editing localization code or copy, read:

- `docs/journey_prototype/localization.md` for this repository's Fluent term
  model;
- the relevant portion of `data/strings.ftl`;
- `data/glossary.toml` when a canonical game concept or keyword appears.

Read [references/translator-descriptions.md](references/translator-descriptions.md)
before writing or reviewing messages, terms, variables, or translator comments.
Read [references/fluent-language-design.md](references/fluent-language-design.md)
when the work involves selectors, counts, agreement, terms, variables, or a new
locale.

## Build the semantic inventory

Inspect the feature in code and, when runtime behavior or presentation changes,
in the browser. Inventory all player-facing language, including headings,
controls, status text, empty states, errors, notifications, tooltips,
accessibility names, and meaningful image descriptions.

For each string, determine:

1. where and when it appears;
2. what it means in game terms;
3. who acts on whom, and whether the event is past, present, future, command,
   question, or status;
4. which values vary and the full domain of each value;
5. whether zero, one, and multiple values are possible;
6. whether space, line count, capitalization, or accessibility imposes a real
   constraint.

Resolve uncertainty from the implementation, data model, design, or user. Do
not make translators infer product behavior from English wording.

## Design translation units

- Localize complete semantic utterances. Keep articles, adjectives, verbs,
  pronouns, punctuation, and word order together.
- Name message IDs by stable meaning and context, not by their current English
  words. Give semantically different uses separate IDs even when English is
  identical.
- Reuse private Fluent terms for canonical game vocabulary. Keep contextual
  grammar in complete messages.
- Pass semantic data as variables. Do not pass prelocalized English fragments,
  punctuation, articles, or already pluralized labels.
- Use selectors for grammatical or semantic variation. Do not assemble
  sentences from translated fragments in React.
- Preserve translator freedom. Specify the required meaning and genuine UI
  constraints; do not prescribe English word order or literal equivalents.
- Write natural, polished source English. Localization infrastructure does not
  excuse vague, telegraphic, or inconsistent copy.

## Write translator descriptions

Place Fluent comments immediately before the message, term, or cohesive group
they describe. Give every new or changed unit enough context to translate it
without opening the source code. Short labels, ambiguous words, variables, and
messages whose grammar depends on game state normally require per-message
comments.

A useful description answers the applicable parts of this compact contract:

- **Placement and role:** the surface and whether this is a title, action,
  status, narration, tooltip, or accessibility label.
- **Meaning and consequence:** what the player sees, does, gains, loses, or
  confirms; explain specialized Dreamtides meaning.
- **Participants and grammar:** identify the actor, action, object, referents,
  tense, and tone when the English can hide them.
- **Variables:** state what each variable represents, its type or allowed
  values, whether zero is possible, and a realistic example when useful.
- **Constraints:** record only real limits such as a compact control, a forced
  line break, markup, or text that must match another named concept.

Never write a comment that merely repeats the English, says only “button
label,” or names an implementation component. Never ask for literal
translation, fixed English word order, or English capitalization rules.

## Author Fluent safely

Use Fluent comment levels deliberately:

- `#` for one message or term;
- `##` for a related group;
- `###` for resource-wide context.

Keep the English source in `data/strings.ftl`. Add or extend a shared
term only when the concept recurs and has a stable canonical meaning. Follow
the repository's literal grammatical-number facet convention for countable
terms; the installed Fluent parser cannot forward a runtime variable into a
term argument.

Model numeric variation with the runtime count selector in the complete
message. Treat exact zero behavior as a product decision separate from plural
grammar. Let locales add their required CLDR categories and morphology.

Do not create global fragments for `a`/`an`, possessives, prepositions, or
conjugated verbs. Anticipate locale-specific case, gender, agreement,
classifiers, numeral placement, spacing, and sentence structure without making
them application-level concerns unless they carry real game semantics.

## Integrate at the display boundary

Request complete message IDs through `useMessages()` and pass typed semantic
variables. Resolve names immediately before display and keep UUIDs throughout
game logic. Keep player-facing fallback and error copy inside the localization
resource.

Do not use translated strings as identifiers, equality keys, parsing inputs,
control-flow signals, analytics dimensions, or test selectors. Add stable
semantic selectors or data attributes when QA needs them.

## Verify the result

1. Run `npm run localization-types` and inspect generated-contract drift.
2. Add focused structural or formatting tests for variables, selector branches,
   and parse diagnostics. Do not assert specific UI strings.
3. Run the relevant component tests and `npm run review`.
4. For runtime or presentation changes, exercise the normal workflow with
   browser QA. Check representative counts such as `0`, `1`, and `2` when they
   are valid, narrow layouts, clipping or overflow, accessibility output, raw
   message-ID leakage, and `window.__caps`.
5. Review every new description independently from the English value: confirm
   that it explains the intended experience rather than paraphrasing the text.

Before finishing, confirm that a translator can determine meaning, variable
semantics, grammatical relationships, and real constraints without reading
TypeScript.
