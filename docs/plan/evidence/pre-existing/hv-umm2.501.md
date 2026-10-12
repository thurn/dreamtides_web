# hv-umm2.501 pre-existing observations

Two descriptions of `thisCharacterSpark()` still said it reads 0 once its source has left play, which RD-hv-umm2.460-1 changed: the `ValueExpr` member's comment in `src/engine/dsl/types.ts` and the Values row of the DSL table in `docs/plan/engine-design.md`. Both are in this bead's areas and now describe the retained last-known spark.

The workspace-preparation step emits missing-art warnings while it links review materializations; the focused, review, and knip checks pass.
