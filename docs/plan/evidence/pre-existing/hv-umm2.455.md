# hv-umm2.455 pre-existing evidence

## Authored explicit-cost Reclaim loss

Canonical repair: **hv-umm2.372**, serialized with the existing timing work.

An authored `reclaim(energy(3))` event with printed cost 5 and a floating
loss of Reclaim has `hasKeyword(..., "reclaim") === false`, while
`Engine.legalActions` admits its void play. `playRoutes` in
`src/engine/rules/timing.ts` admits an authored Reclaim ability independently
of the layered keyword. The four synthetic loss witnesses cover both active
owners and both blind deck and ceased sources. They fail on authoritative
state legality before sampling; their corresponding gain witnesses pass.

Reproduction and unchanged runtime source hashes are retained in
`/tmp/dreamtides-455-validation/explicit-loss-receipt.json`, with the full
fixture, output, and JSON assertions in the adjacent `explicit-loss-witness`
files. The parent added this evidence to canonical372 and455 native notes.

This bead checks source-independent Reclaim legality using a plain printed
Reclaim keyword for its loss fixture, whose normal cost is 5. An explicit
cost gain charges 1 instead of its printed cost 5. The explicit authored-cost
loss remains within372's repair scope.
