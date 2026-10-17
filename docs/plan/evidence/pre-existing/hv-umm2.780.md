# hv-umm2.780 pre-existing scope

The separately filed hv-umm2.782 owns nested lexical chosen-type scopes: substitution traverses a nested `chooseSubtype.then` before that nested choice resolves. This bead keeps that traversal intact and changes only supported subtype field substitution. The exclusion scenarios use one lexical choice, or a static source choice, and provide no runtime result for the nested-choice repair.

The hv-umm2.779 test-fixture work remains separate from this deterministic synthetic exclusion contract. No additional pre-existing issue was encountered in the focused exclusion run.
