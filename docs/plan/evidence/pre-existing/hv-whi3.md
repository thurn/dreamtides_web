# Pre-existing observations for hv-whi3

Scope: bounded source inspection at base `3cf50d1fcc8dfaaca34300f33779c8367dd52dad`. No lab-solver behavior was executed or changed.

`src/engine/testing/lab-solver.ts:164–179` selects automatic ready back-rank catalog fixtures. The role rejection at line 167 reads only an `anyOf` branch. With no alternatives, the branch is `{}`; the outer selector enters `predicates` at line 168, while the following catalog-characteristic checks cover figment, ability, subtype, spark, and cost rather than challenge roles. Thus an outer `challenging: true` predicate can select a role-free printing in this source path. `sharesTypeWithAnotherChallenger` likewise has no automatic role/partner qualification in that function.

This is the related lab observation from the normal Claude review of hv-umm2.614, rather than a second confirmed finding or evidence of a current production cost UUID. The public engine selector independently checks subject and partner live challenger roles, distinct identity, current controller, and effective types in `src/engine/dsl/selectors.ts:150–165`. Future authoring acceptance retains its original private recipe and final joins; this copy bead has no solver or production content authority.
