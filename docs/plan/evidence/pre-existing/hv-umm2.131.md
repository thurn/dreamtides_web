# hv-umm2.131 pre-existing issues

## The variable discard cost has no least X

Embrace the Infinite (`79b37916-c05d-4818-9d67-3b90e340926e`) prints "Gain
X⍟. / Reclaim – Discard X cards." Its Reclaim route replaces the X● cost
with a variable discard, so the discard count is its X. Discarding zero cards
gains 0⍟ and banishes the reclaimed event for no effect, which the contextual
X rule disallows (rules § Costs, Requirements, and X; compare
RD-hv-umm2.68-1 for "Banish X cards from your void").

The DSL form `discardCostFilter(filter, { count: "x" })`
(`src/engine/dsl/builders.ts`, the `discard` variant of `PaymentCost` in
`src/engine/dsl/types.ts`) carries no minimum, and `leastCount` in
`src/engine/rules/costs.ts` returns a minimum only for the void banish
(`banishXCost({ min })`). rules.md says authors use the zero-admitting form
only when zero is meaningful, so the card stays `pending` until a primitive
bead adds a least X to the variable discard (builder option, type field,
`leastCount`, affordability and prompt minimum, cost-composition contract
rows).
