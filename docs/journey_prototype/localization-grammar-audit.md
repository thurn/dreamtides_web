# Localization grammar audit

This audit records the semantic review applied to the Trox source catalog. The
source report contains 666 messages extracted from 577 TypeScript and TSX
files. Every row has source text, translator context, stable identity,
condition context in its description, placeholder metadata, and source
locations.

## Identity and meaning review

Duplicate English text shares an identity only when its UI meaning and argument
contract match. Shared contracts include deck filtering and sorting, New
Journey, Retry, Signature Cards, and Dreamsign names. Context-sensitive words
use explicit meaning keys, including Ability, Avatar, Back, Cancel, Close,
Continue, Fast, Interrupt, Pool Viewer, and battle-versus-Journey deck captions.

The catalog has no identity with multiple translator descriptions. Meaning keys
represent real semantic distinctions rather than callsite or component names.

## Complete-message ownership

- Application, coop, and Journey gates pass state facts into complete messages.
- Deck and pool browsing own complete titles, total and filtered counts, owner
  switches, filter choices, sort choices, and accessible action names.
- Exploration outcomes own the complete result sentence. Cards, Dreamsigns,
  subtypes, form names, and authored disclosures are opaque arguments.
- Gamble owns complete wager, attempt, prize, cash-out, and outcome messages.
- Battle owns phase, participant, memory, pile, picker, merge, Dreamwell,
  victory, and tutorial grammar.
- Accessibility messages are complete descriptions, including hidden joins and
  entity summaries. Visible and hidden copy use separate messages when their
  communicative purpose differs.

RON-authored prose, user input, names, and developer diagnostics remain opaque
authored strings and use explicitly authored component props.

## Numeric families

Each numeric family was reviewed at 0, 1, 2, and 5, plus applicable exact
boundaries and product limits. This covers deck and pool counts, connected
players, reward and purchase counts, wager attempts, card copies, prompt
selection progress, memory counters, points, energy, Spark, reclaim, card-order
positions, and Journey completion statistics.

The selected number always represents the grammatical head of the sentence.
Values displayed as fixed notation, such as a source-English leading-plus
delta, remain semantic numeric arguments inside a complete message. Exact
branches are used only when product wording differs at that exact value.

## Enum and presence selectors

Owner, side, entity kind, speaker, form, and presence selectors were traced to
their application-state sources. Branches are complete sentences or complete
labels. Boolean selectors describe semantic presence, such as whether a card
has rules text or artwork has a title.

Card names, form names, Dreamsign names, and RON prose provide no grammatical
gender or case metadata. Messages place these values in constructions where
the target locale can treat them as opaque proper names or quoted content.
Locale work that requires inflecting those values must first add the relevant
facets to the canonical data model.

## Placeholder review

Placeholder unions are intentional. A branch may omit a value when the product
state makes it absent or when the complete branch has fixed wording. Reviewed
examples include untitled artwork, cards without rules text, free costs, and a
single-object action whose English label does not print the numeric value.

Arguments use semantic names and stable kinds. Shared identities have the same
argument kinds at every callsite. Opaque authored values are never parsed from
resolved output.

## Row expansion and lint policy

The battle participant accessible summary expands relationship and
locale-specific Points grammar into 12 rows. This cost is intentional because
each row is a complete accessible sentence. Other selectors remain below the
configured 256-row ceiling.

The project lint policy denies warnings and records three reviewed exceptions:

- `trox.formula-injection`: source-English delta labels intentionally begin
  with `+`; translator CSV files are treated as data.
- `trox.omitted-placeholder`: complete branches intentionally omit values that
  are absent or lexically unnecessary.
- `trox.human-row-expansion`: the 12-row participant summary gives translators
  complete sentences for relationship and Points grammar.

Each exception is scoped to one rule with a nonempty rationale in `trox.ron`.

## Resolution boundary audit

`LocalizedString` is carried through state, controllers, adapters, and Cumulus
props. Resolver calls directly feed intrinsic text nodes, accessibility
attributes, placeholders, alternative text, or document metadata. Authored
content uses a separate prop and reaches the same browser sink without being
registered as a translation unit.

Persisted prompts carry semantic built-in or Dreamwell references. Prompt
messages are constructed after loading and resolved only by the presentation
boundary. Deterministic fold state and logging use IDs, indexes, UUIDs, and
semantic values.

## Review commands

- `node scripts/trox.mjs extract`
- `node scripts/trox.mjs check --deny warnings`
- `node scripts/trox.mjs bundle --allow-missing`
- `node scripts/trox-generated-check.mjs`
- `npm run audit:player-localization`
- `npm run review`
- `npm run review:full`

The source report and all QA CSVs are checked after extraction. A second
extraction and bundle build must produce byte-identical tracked artifacts.
