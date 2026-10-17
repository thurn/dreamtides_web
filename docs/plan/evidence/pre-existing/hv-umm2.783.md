# hv-umm2.783 pre-existing observations

The existing `withChosenSubtype` replacement loop in
`src/engine/effects/primitives/choose-subtype.ts` substitutes the `subtype`
field and traverses nested `chooseSubtype.then` instructions. The separately
filed `hv-umm2.780` exclusion repair and `hv-umm2.782` lexical-scope repair
own those behaviors. This bead reads that implementation to reconstruct a
public declaration and leaves its traversal unchanged. These are source
observations; this bead runs no new exclusion or nested-choice reproduction.
