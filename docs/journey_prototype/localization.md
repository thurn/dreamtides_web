# Localization Catalog

The English Fluent catalog is stored in `data/locales/en-US`. Its
`manifest.json` lists every resource in bundle order. Each locale mirrors this
directory structure and supplies the same set of resource files.

The catalog is organized by player-facing responsibility:

- `terms.ftl` contains shared vocabulary and localization diagnostics;
- `app-shell.ftl` contains loading, errors, menus, and application chrome;
- `coop.ftl` contains cooperative rooms, presence, conflicts, and shared
  settings;
- `journey.ftl` contains Journey progression and navigation;
- `cards.ftl` contains cards, decks, collections, and rules presentation;
- `sites.ftl` contains Journey sites and their outcomes;
- `battle.ftl` contains battle presentation and controls;
- `battle-prompts.ftl` contains battle choices and pending prompts;
- `accessibility.ftl` contains accessibility-only names, descriptions, and
  narration.

Visible messages remain with their feature even when the same value is also
used as an accessible label. Messages belong in `accessibility.ftl` when their
purpose is exclusively assistive output.

The shared vocabulary follows the canonical terms used by
`data/glossary.toml` and the player-facing Cumulus surfaces.

Fluent terms begin with `-` and are private to the localization resource. React
code requests complete message IDs through `useMessages()`; messages reference
terms when they need canonical game vocabulary.

## Typed runtime contract

`scripts/generate-localization-types.mjs` generates
`src/data/localization-messages.ts` from every resource listed by the English
locale manifest. The generated
module contains the message-ID union, exact variable contracts, and the
JSON-safe `FluentMessageDescriptor` union. Descriptors contain a known message
ID and finite string/number variables, so they can cross view-model, replay,
and cooperative state boundaries without carrying locale output.

`createMessageDescriptor()` in
`src/data/localization-descriptors.ts` constructs descriptors with exact
variable keys. `isFluentMessageDescriptor()` validates data arriving from a
serialized boundary. `formatMessageDescriptor()` in
`src/cumulus/hooks/use-messages.ts` is the presentation formatter and returns
the localized invalid-descriptor fallback for malformed data. Run
`npm run localization-types` after changing the catalog.

Battle pending prompts persist these descriptors rather than rendered labels.
Transfiguration offers carry a discriminated `TransfigurationChange`, and
Exploration view models preserve authored content as opaque values while
React formats code-authored connective messages.

The player-runtime ownership inventory is shared by
`eslint-rules/ui-boundary-roles.js`, the `cumulus/no-unlocalized-player-copy`
rule, and `scripts/audit-player-localization.mjs`. Use
`npm run audit:player-localization` to inspect the classified source inventory;
the check mode requires every candidate to be a protected player file, an
authored-data source, a machine/diagnostic value, or an explicit developer or
fixture surface.

## Term Groups

The vocabulary covers:

- product and named world concepts: `-dreamtides`, `-dreamwell`, and
  `-dream-atlas`;
- world entities: `-journey`, `-dream-avatar`, `-dream-guide`, `-dreamscape`,
  `-dreamsign`, `-tide`, `-site`, and `-reward`;
- cards and zones: `-card`, `-character`, `-event-card`, `-deck`, `-hand`,
  `-void`, and `-figment`;
- battle language: `-battle`, `-player`, `-opponent`, `-turn`, `-round`, and
  `-point`;
- resource names that are count-invariant in English: `-essence`, `-energy`,
  and `-spark`.

Site action verbs and keywords stay out of the shared term set. Their form can
depend on tense, mood, subject, object, and the surrounding sentence. Complete
messages give a translator enough context to conjugate or replace them.

## Grammatical Number

Every countable term exposes a locale-private `$number` facet whose default is
`one`. The current Fluent syntax accepts literal term arguments, so the complete
message selects on its runtime count and passes the matching CLDR category to
the term:

```ftl
-card =
    { $number ->
       *[one] Card
        [other] Cards
    }

deck-card-count =
    { $count ->
        [one] { $count } { -card(number: "one") }
       *[other] { $count } { -card(number: "other") }
    }
deck-heading = { -deck }
```

Numeric selectors use the locale's CLDR rules. A translation may add `zero`,
`two`, `few`, or `many` message variants and matching term facets. A singular
label can reference the term without arguments because `one` is its default.

The term does not render the numeral because its position, spacing, and role
are locale-specific. A Chinese translation can put the appropriate classifier
in the term and place the numeral next to it in the complete message. A message
whose layout renders the numeral separately can use the same grammatical-number
facet as its adjacent label.

## Complete Messages Own Grammar

Messages own articles, possessives, adjectives, verbs, punctuation, and word
order. This keeps English `a` versus `an` out of a context-free article term
and lets translations express agreement across the whole phrase.

Fluent permits locale-specific grammar that is absent from the English source.
A locale can parameterize a term by grammatical case and pass that parameter
from its translated message. It can also add private attributes such as
`.gender` or `.starts-with` and use them as selectors for adjective, article,
or verb agreement. These details stay inside the locale's Fluent resource and
do not become application variables.

Term values use the canonical title-style game vocabulary. A complete message
may use a contextual lexical form when sentence casing, compounding, or idiom
requires one.

## Formatting

Run `npm run format:fluent` to format the English Fluent resources with the
canonical `@fluent/syntax` serializer. Run `npm run format:fluent:check` to
verify formatting without modifying the file. The formatter rejects invalid
syntax and confirms that its output parses to the same Fluent syntax tree.
