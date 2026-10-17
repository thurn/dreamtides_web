# hv-umm2.782: pre-existing fixture observation

`src/engine/effects/primitives/contracts/choose-subtype-captures.contracts.ts:141`
executes `drawMatching` with `CHOSEN_SUBTYPE` before its first type choice in
its shared-mode control. The case passes and observes a later chosen draw,
but its initial executed placeholder is unbound. A scoped first choice can
exercise inherited mode zero using a type-bound fixture, as the nesting
contracts do. This is a source-inspected fixture-quality observation, with
no production failure established. The existing control is outside this
bead's implementation areas. The parent confirmed the observation and filed
required test-cut hv-umm2.784, which depends on this bead and joins Phase 5
gate hv-umm2.46. Its scope deletes the redundant invalid mode control after
the type-bound mode-zero/save/replay replacement lands.
