# Fluent Language Design

## Contents

- [Translate meaning, not fragments](#translate-meaning-not-fragments)
- [Shared terms](#shared-terms)
- [Numeric variation](#numeric-variation)
- [Articles and initial sound](#articles-and-initial-sound)
- [Gender, case, and agreement](#gender-case-and-agreement)
- [Classifiers and numeral placement](#classifiers-and-numeral-placement)
- [Variables and selectors](#variables-and-selectors)
- [Writing-system resilience](#writing-system-resilience)
- [Common failure modes](#common-failure-modes)

## Translate meaning, not fragments

Give translators the largest unit needed to rearrange grammar naturally. A
complete message owns its articles, modifiers, nouns, verbs, objects,
punctuation, and word order. Do not concatenate localized fragments in React or
reuse a fragment because its English spelling happens to match.

Prefer a complete message such as “Gain 2 cards” over separately translated
“Gain,” “2,” and “cards.” A locale may need a different order, a classifier, a
case change, or agreement between words.

Keep separate IDs for separate meanings. English “Draw” can name an action,
describe a tied result, or command the player to take cards. Those contexts may
translate differently.

## Shared terms

Use Fluent terms for stable, canonical vocabulary such as Dreamtides world
concepts. Terms are private to the resource and support locale-specific
morphology. Read `docs/journey_prototype/localization.md` and reuse the terms at
the top of `data/tabula/strings.flt` before introducing another term.

Do not force every occurrence through a term when idiom, compounding, sentence
case, or grammar calls for a contextual translation. Consistency means
consistent meaning, not mechanically identical surface forms.

Keep action verbs, articles, possessives, and prepositions in complete messages
unless a locale has a well-founded private pattern for them.

## Numeric variation

Plural categories are locale-specific grammatical categories, not universal
mathematical labels. A locale may use `zero`, `one`, `two`, `few`, `many`, and
`other`, and a given number can fall into different categories across locales.
Nouns, adjectives, verbs, and pronouns can all vary with the count.

Distinguish two decisions:

1. **Grammatical selection:** choose the correct form for `$count` through a
   Fluent numeric selector.
2. **Semantic zero copy:** decide whether zero should use a product phrase such
   as “No cards,” display `0`, or suppress the unit. Zero does not automatically
   require Fluent's `[zero]` category.

In this repository, countable terms accept a locale-private literal `$number`
facet. The complete message selects on the runtime count and passes a literal
category because the installed Fluent syntax cannot forward a variable into a
term argument:

```ftl
# $count is the number of cards currently in the player's deck and can be zero.
deck-card-count =
    { $count ->
        [one] { $count } { -card(number: "one") }
       *[other] { $count } { -card(number: "other") }
    }
```

A locale can add the message branches and matching term facets its grammar
requires.

## Articles and initial sound

Do not create a global `a-or-an` variable or select an English article from the
first letter of a translated noun. Article choice may depend on sound, gender,
number, case, definiteness, or other grammar, and many languages use no article
at all.

Keep the whole noun phrase in the message. A locale may add private term
attributes such as `.gender` or `.starts-with` when useful; these stay inside
that locale's resource rather than becoming application variables.

## Gender, case, and agreement

Expect nouns, articles, adjectives, participles, pronouns, and sometimes verbs
to agree. A term may need locale-private parameters for nominative, accusative,
genitive, or another case. The source locale does not need to expose grammar it
does not use.

Do not ask application code to guess grammatical gender from a name. Pass
gender only when it is an actual, known property of the game entity and the
message meaning requires it. User-entered or display names may be impossible to
decline or gender reliably; write descriptions that expose this uncertainty.

Avoid pronouns when the referent can be ambiguous in cooperative play. When a
pronoun is intentional, document exactly whom it refers to and whether the
audience is singular or plural.

Keep conjugated verbs in complete messages so the locale can account for
subject, object, tense, aspect, mood, politeness, and evidentiality as needed.

## Classifiers and numeral placement

Chinese and other languages may require a classifier between a numeral and a
noun. Languages also differ in numeral order and spacing. Do not bake an
English space into code or place a numeral in one React element and its unit in
another unless the design genuinely renders them separately.

When layout deliberately separates a large numeral from a label, document that
relationship. The label can still select on the count for grammar even when it
does not print the numeral. A locale may put its classifier in the term or
complete message as appropriate.

## Variables and selectors

Pass raw semantic values:

- numbers as numbers, not preformatted strings;
- dates or durations in a form locale-aware formatters can consume;
- canonical display names only at the display boundary;
- enumerated states with documented values;
- booleans only when the two meanings are genuinely binary and stable.

Do not pass English fragments such as `"won"`, `"cards"`, or `"your"` for a
translator to assemble. Do not interpolate raw UUIDs into player copy.

Select on the semantic distinction a translator needs. Document each variant,
including which actor or state it represents. Provide an `other` fallback where
Fluent grammar requires it.

## Writing-system resilience

Assume translations may:

- expand substantially relative to English;
- use no spaces or use different line-breaking rules;
- render right-to-left with bidirectional content inside variables;
- use different punctuation, quotation marks, and capitalization;
- require more or fewer lines;
- inflect names or avoid constructions that require inflection.

Avoid uppercase transformations in code, character-count slicing, word-based
layout assumptions, and manual punctuation outside the message. Prefer
responsive containers and semantic emphasis over fixed English-width boxes.

Fluent's isolation marks protect interpolated bidirectional content. Do not
strip them merely because they appear in raw DOM text during tests.

## Common failure modes

Reject these patterns:

- a message assembled from localized fragments;
- one ID reused for unrelated meanings because English is identical;
- a translator comment that repeats the source value;
- a variable with no semantic description;
- manual `count === 1` pluralization in React;
- a global English `a`/`an` helper;
- assuming grammatical gender from a display name;
- passing localized text back into business logic;
- using a translated value as a test selector;
- hard-coded uppercase, punctuation, spaces, or word order outside Fluent;
- splitting a numeral and noun for styling without documenting the layout;
- treating `[zero]` as a universal rule for the number zero;
- forcing canonical term spelling where a locale needs inflection or idiom.

Consult the official Project Fluent terms and selectors guides and Unicode CLDR
plural and grammatical-inflection guidance when a locale needs a pattern not
covered by the repository contract.
