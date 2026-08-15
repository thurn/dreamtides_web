# Fake configurability audit

This audit covers canonical typed RON models, compatibility lowering, generated-data compilers, runtime trust boundaries, and consumers. A field belongs in an authoring schema when changing it can produce a supported game. Stable behavior identities and total presentation mappings may remain closed; counts, ordering, membership, and named tuning groups should reflect the ranges their consumers support.

## Remediated authoring contracts

| Catalog | Decision | Current contract |
| --- | --- | --- |
| Augury | Treat the two-offer, distinct-family encounter as a game rule; treat archetype membership and order as catalog data. | `encounter` exposes `allow_decline`. The archetype list accepts any unique subset with at least two enabled entries spanning at least two families. Offer generation produces the fixed two slots from distinct families. |
| Exploration | Make encounter action cardinality configurable within the screen and editor boundary. | Each encounter contains one through four actions. The RON model, compatibility compiler, runtime parser, editor model, view-model adapter, and screen consume the authored array. |
| Random Sites | Treat an away Random Site as one materialized destination; make the home selection use the renderer-supported range. | `home_choice_count` accepts two or three and cannot exceed the destination catalog. A home choice requires at least two distinct destinations for valid saved-state metadata. Away sites derive one destination. The insufficient-destination policy is the fixed `fail` behavior emitted by compatibility lowering. |
| Transfiguration | Use the form array as both membership and display order; derive presentation identity from stable form identity. | The catalog accepts a nonempty unique subset of the nine supported form behaviors in authored order. Choice limits accept `All` or a positive count. Glyphs derive from form IDs. `Perfected` may reference any nonempty ordered set of unique configured non-self forms. |
| Resonance | Represent a total closed presentation registry as named fields. | The authoring schema contains `ember`, `valor`, `vision`, `wild`, and `shadow` presentation records. Stable IDs, deck colors, glyphs, compatibility order, and runtime identity derive in the lowerer. Runtime validation accepts compatibility records in any order while requiring the complete identity set. |
| Tutorial journey pool | Make scenario composition variable while preserving the ordinary journey pool-size contract and renderer limit. | The pool accepts one or more Tides, one or more opening offers, and one through four cards per offer. Tide UUIDs without legacy aliases lower to their canonical UUID text. The compatibility Tide type derives as `valor`. |
| Gamble | Make game membership, list ordering, and stage counts follow their consumers. | The catalog accepts one through five unique games in authored order with exactly one fallback. Ladder attempts are a nonempty consecutive sequence consumed through configured length. Starway supports one through three consecutive tiers, matching its three-slot renderer. Outcome-label, suit-outcome, and gate-reward total mappings are order-independent. |
| Economy shop stock | Represent a total closed stock mapping as named fields. | `card_shop`, `specialty_shop`, and `dreamsign_bazaar` own their stock values directly. Compatibility lowering emits the established keyed stock object. |
| Atlas profiles and fixed policies | Keep the seven-layer journey shape and its early/late tuning phases as game rules; encode fixed algorithms as code-owned behavior. | Layers remain One through Seven with starter, standard, and boss roles. Fill profiles are keyed by the closed `Early` and `Late` Rust enum variants. Compatibility lowering emits `allow-repeats`, unique non-Draft fill, and `omit-fill`; the authoring schema exposes the configurable known-Dreamsign site. |
| Draft pool strategy | Treat `tides4` as the implemented behavior vocabulary rather than an author choice. | The authoring schema exposes the `tides4` tuning record directly. Compatibility lowering emits `default-strategy = "tides4"` and the keyed strategy table expected by runtime consumers. |

## Retained invariants

These exact contracts express game identity, referential completeness, or a closed behavior vocabulary rather than tunable collection shape:

- The Atlas has seven ordered progression layers. Layer One is the starter and Layer Seven is the boss.
- Dreamscapes contain exactly one starter and one boss role.
- Site metadata covers every renderer-supported site type, Dream Guides cover every guide specialty, and glossary rule symbols cover every parser-supported token. These are total mappings over closed code vocabularies.
- Reward-selection quality and predicate tables cover the behavior identities emitted by the selection engine.
- Three-Gate Wager uses the Six, Nine, and Jack progression; Four-Suit Reprise maps every playing-card suit and outcome exactly once.
- Exploration effect definitions, Augury ability variants, Transfiguration operation variants, tutorial action kinds, and Gamble rule variants remain closed behavior vocabularies. Adding a new variant requires an executable implementation and a corresponding typed contract.
- Pool sizes, card-copy totals, uniqueness, foreign UUID references, probability bounds, and cross-field reachability remain validation invariants because they prevent malformed or unreplayable games.

## Review rule

For future catalog changes, apply these checks at the typed RON model, compatibility lowerer, generated-data compiler, runtime parser, editor, and renderer:

1. If a value has one supported setting, encode that setting in the consumer or lowerer and omit it from the authoring schema.
2. If a collection is user-facing, validate the smallest and largest supported sizes and consume its authored order.
3. If a collection is a total map over a closed code vocabulary, prefer named fields or set-based completeness validation over positional validation.
4. If membership is intended to be configurable, test a reordered subset through the full compilation and runtime boundary.
5. If a count changes terminal behavior, logging, or visual slots, derive those decisions from the configured collection and cap the range at the proven renderer boundary.
