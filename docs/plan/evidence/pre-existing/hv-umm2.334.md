# hv-umm2.334 pre-existing findings

## Content inventory credits whole-hand payment to `discardCostFilter`

`scripts/content-inventory.ts` (the `discardCostFilter` DSL entry, note
"discard a matching card, X cards, or the whole hand as a cost", and the
`cost-discard` / `cost-discard-filter` tags matching "Discard your hand")
credits Gilded Catalyst `0bddeb19-ff49-4a77-bc06-955377ba3ed1` and Liminal
Dreamer `8e7b0eb9-4933-420b-abee-413bf5b3d2fc` with `discardCostFilter` and the
`chooseCards:discardCost` prompt kind in
`docs/plan/evidence/content-inventory.json`. Their whole-hand cost is the
separate `discardHandCost()` form, which raises no prompt. This bead's areas
exclude the inventory script; a bounded inventory edit can add a
`discardHandCost` entry and route "Discard your hand" costs to it without a
prompt kind.

## Liminal Dreamer's activation has no other cost

Liminal Dreamer `8e7b0eb9-4933-420b-abee-413bf5b3d2fc` reads "Discard your
hand: Draw one card per stored ⧗." With the empty-hand semantics of
RD-hv-umm2.334-1 and no counter spend, exhaustion, or once-per-turn limit in
its text, its activation stays legal after every use. Its owning bead
(hv-umm2.95) should confirm that the Greedy and Random policies and the
fuzzer's step budget end a turn that repeats it (decision D12 makes such
loops intentional).

## Dependency audit output

The fresh-worktree `npm install` reported dependency audit findings; it
completed successfully. This bead's commit changes no dependency or lockfile.
