# hv-umm2.160 pre-existing observations

Shardwoven Tyrant (35c3e8cb-dc59-4f5c-98c8-fd764fb36d2b) stays `pending`. Its
"1●, Abandon X figments: Dissolve an enemy with X✦." needs a variable-count
abandon cost that the DSL lacks: the abandon `PaymentCost` in
`src/engine/dsl/types.ts` takes only a fixed `count: number` (or a single
`captureCost` character), and `abandonCost` in `src/engine/dsl/builders.ts`
builds only that form. The content inventory
(`docs/plan/evidence/content-inventory.json`) lists the card's required
primitives as existing (`abandonCost`, `selectorBounds`), which understates
it: an `count: "x"` abandon form with a least X, its `leastCount` and
captured-X handling in `planCosts` (`src/engine/rules/costs.ts`), the lab
solver's staging of X figments (`src/engine/testing/lab-solver.ts`, which
places no figments), the cost-composition contract rows, and rules text for
"Abandon X" under § Costs, Requirements, and X (including whether X = 0
against a 0✦ enemy is meaningful) are a primitive bead's work.

A forced single candidate for an activated ability's abandon cost is
auto-answered with an `autoAnswered` notice rather than raising the
`abandonCost` prompt, so browser QA that expects the prompt after the other
candidates have left play must expect the notice instead. This is the
existing prompt policy, recorded for later QA authors.
