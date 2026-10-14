# RD-hv-umm2.697-1: Another event means a different physical card at resolution

- Ladder: 5 (the simplest reading consistent with the printed clause and Dreamtides physical identity).
- rules.md: § Keywords and Effects → Current-turn occurrences and physical membership; § Playing Cards and the Stack → Copies on the stack and Playing from the void; § Targeting → Cards in a void.
- Affects: 3fdf265c-8aa2-4367-9fee-43e242bdb462 (Shared Revelation).
- Why: The instruction names another event, rather than another play of the source. Compare the captured physical instance with the resolving source, excluding every occurrence of that source. A different instance of the same printed UUID qualifies. Read the resolving effect's retained controller and the committed event type at play time, rather than current type, controller, or zone. Reclaim is an actual play; an earlier Reclaim play of the same physical source remains excluded. An original event is physically different from its stack copy and qualifies for that copy only when its controller played the original this turn. An emblem or Dreamwell source has no physical card to exclude.

## Ladder evidence

1. D15 specifies that stack copies are not played. The current normative rules specify captured play-time type, the playing actor, ordinary and extra turn resets, and stable physical cards across zone changes. They do not specifically decide whether an earlier replay of the same source is another event.
2. Shared Revelation's catalog module retains its printed clause and is pending, with no authored engine abilities under D36. The owned source's conditions and current-turn readers implement counts, rather than a source-excluding event-history predicate. A UUID/printed-clause search in the battle/rules/card source and rules-decision ledger supplies no actual prototype precedent for this clause; P10 excludes sandbox shortcuts.
3. The read-only Rust `rules_engine/src/ability_data/src/condition.rs` enum has no played-another condition. `predicate.rs` has `Another` and `AnyOther` for card selection; `quantity_expression_data.rs` has `PlayedThisTurn`. The targeted battle-query/parser/serializer search demonstrates no execution precedent deciding this historical source exclusion. Rust's targeting phrase “another card (not the source)” is selection precedent only.
4. The [official archived April 2016 Magic Comprehensive Rules](https://media.wizards.com/2016/docs/MagicCompRules_04082016.pdf), rule 702.116a, check Surge while casting using an earlier spell. Rule 400.7 gives zone changes a new object identity. Those rules do not settle this Dreamtides resolution predicate with stable physical identity; their zone identity is not imported.
5. Excluding the same physical source throughout the turn is the simplest reading consistent with another card, stable physical identity, captured current-turn occurrences, and D15. A total-card count cannot express either event qualification or source exclusion.

## Public form and verification scope

`playedAnotherEventThisTurn()` is one resolving `Condition`, excluded from `StaticCondition`. It reads only the controller's existing committed `turnLog.played` records and the physical source. It adds no historical fields, query framework, event kind, prompt kind, or play-time cost behavior. Shared Revelation's production authoring and original batch acceptance remain with hv-umm2.192.

The private synthetic contract may change a fixture's current printing/type through its normal synthetic resolution hook to stress captured qualification. The current runtime exposes no production live card-type remap primitive; that transition is a synthetic contract witness, not a browser or production capability claim. The LAB composition uses only the public DSL.
