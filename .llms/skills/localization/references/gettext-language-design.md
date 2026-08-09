# Gettext Language Design

## Contents

- [Translate complete meaning](#translate-complete-meaning)
- [Choose gettext context deliberately](#choose-gettext-context-deliberately)
- [Model grammatical number](#model-grammatical-number)
- [Model gender, animacy, and agreement](#model-gender-animacy-and-agreement)
- [Handle case, names, and conjugation](#handle-case-names-and-conjugation)
- [Use canonical vocabulary](#use-canonical-vocabulary)
- [Pass placeholders safely](#pass-placeholders-safely)
- [Respect writing systems and layout](#respect-writing-systems-and-layout)
- [Reject unsafe abstractions](#reject-unsafe-abstractions)

## Translate complete meaning

Give translators the largest unit needed to rearrange grammar naturally. A
message owns its articles, modifiers, nouns, verbs, objects, punctuation,
placeholders, and word order. Prefer “Gain {count} cards” as a plural message
over separately translated “Gain,” a count, and “cards.” A locale may need a
different order, classifier, case, or agreement pattern.

Treat each source string plus optional gettext context as the message's stable
identity. Do not reuse one message for different meanings merely because the
English spelling matches. Do not make incidental copy edits during a migration;
the existing source-English output remains a separate feature contract.

## Choose gettext context deliberately

Use `pgettext` or `npgettext` when the same source text has meanings that can
translate differently. Context should identify semantics rather than a file or
component, for example `command: reveal deck` versus `status: choice remains
available` for “Open.” Keep context concise and stable across refactors.

Context disambiguates catalog entries; it does not select a variant at runtime
and it is not shown to the player. Do not encode grammatical gender, count, or
temporary UI state in context when the application must choose among variants.

## Model grammatical number

Use `ngettext` or `npgettext` for every count-dependent message, including
messages where agreement affects an adjective or verb rather than the noun.
Supply English singular and plural source forms and the raw numeric count.
The locale catalog provides its required plural forms; Polish, for example,
uses three forms in this proof-of-concept catalog.

Plural categories are grammatical categories, not universal mathematical
labels. Do not branch on `count === 1`, add an English `s`, or assume that zero
has its own plural category. Decide product-specific zero behavior separately:
“No cards” may be a distinct complete semantic message, while “0 cards” belongs
to normal plural selection.

Keep the numeral and all agreeing words in the message whenever the design
allows it. If layout deliberately renders a numeral separately from its label,
still select the label with the count and explain in the translator comment
that the numeral appears elsewhere.

## Model gender, animacy, and agreement

Separate product semantics from grammatical metadata:

- Pass a gender, animacy, participant role, or relationship only when it is a
  trustworthy property in the domain model and the message meaning needs it.
- Select among complete messages in a typed formatter. Each branch should
  contain the entire clause or phrase that may change agreement.
- Document the actor, object, referents, and every possible semantic value.
- Provide a complete neutral or fallback construction when the data can be
  absent or unknown.

Do not infer gender or animacy from a name, avatar image, pronoun guess, suffix,
or English noun. Do not expose language-specific labels such as “masculine
accusative” as game-state values merely to assemble a translation. Gettext PO
catalogs cannot add runtime selector branches that TypeScript does not call.

When existing English copy must remain exact and the available domain data
cannot support a target language's required agreement, preserve source parity
and report the limitation. A separately authorized copy change can choose a
complete neutral construction.

## Handle case, names, and conjugation

Inserted names may be player-authored, may not reveal gender, and may be
impossible for a translator to inflect. Document whose name it is and whether
it is controlled vocabulary. Prefer a complete construction that lets the
locale avoid declining an uncertain name.

Keep conjugated verbs with their subject, object, tense, aspect, mood, and tone.
Do not translate a reusable bare verb and splice it into several clauses. If
the application selects past versus future or player versus opponent, model
those as real semantic variants of complete messages.

For controlled vocabulary with known case forms, a typed formatter may accept
a semantic role and request separate complete gettext messages. Keep the
language-specific morphology in the PO translation, not in TypeScript suffix
tables.

## Use canonical vocabulary

Consult `data/glossary.toml` and identify canonical Dreamtides concepts in the
translator comment. Gettext has no locale-private equivalent of a Fluent term,
so include the vocabulary inside each complete message. Translators may need an
inflected, compounded, or idiomatic surface form even when the underlying
concept stays consistent.

Do not extract isolated nouns, articles, prepositions, possessives, or verbs as
shared fragments. Reuse a gettext message only when the complete message has
the same meaning and grammatical role in every use.

## Pass placeholders safely

Use named semantic placeholders such as `{count}`, `{actor}`, `{target}`, or
`{duration}`. Keep the placeholder set identical in the singular source,
plural source, and every PO form. Let translators reorder or repeat
placeholders; `formatGettext()` substitutes after gettext selects a complete
translation and rejects missing or unused values.

Pass values in their semantic form:

- numbers as numbers for plural selection;
- locale-formatted dates, durations, quantities, and lists as complete values;
- display names resolved only at the presentation boundary;
- enumerated state only to a typed complete-message selector.

Do not pass prelocalized fragments, raw UUIDs, punctuation, spaces, articles,
or already pluralized labels. Treat variable content as potentially long and,
for user-authored values, bidirectionally mixed or grammatically unknown.

## Respect writing systems and layout

Assume translations may expand substantially, use right-to-left direction,
omit spaces, use different punctuation and capitalization, or require
different line breaks. Keep punctuation and meaningful spacing inside the
message. Avoid uppercase transformations, word-based slicing, character-count
assumptions, and fixed English-width containers.

Languages with classifiers may need words between a numeral and noun. Languages
may place the numeral elsewhere or inflect adjacent adjectives and verbs. Keep
the complete counted expression together unless the interface deliberately
separates it, and document that visual relationship when it does.

## Reject unsafe abstractions

Reject these patterns during review:

- concatenating translated fragments in React or TypeScript;
- wrapping gettext in a helper that hides literal strings from `xgettext`;
- reusing identical English for unrelated meanings without context;
- manually selecting English singular and plural forms;
- global article, possessive, preposition, noun, or verb helpers;
- inferring gender, animacy, or case from a display name;
- embedding language-specific grammar rules in application code;
- using translated output in business logic, persistence, or tests;
- formatting punctuation or whitespace outside a complete message;
- translator comments that omit variable meaning or merely repeat the source.

Prefer small typed formatters that accept real domain facts and return one
complete gettext message. Their job is semantic selection; the PO catalog owns
wording, word order, and morphology within every selected message.
