# Pre-existing issues found by hv-umm2.490

- `scripts/content-inventory.ts --check` (and plain regeneration) throws `fulfilled pending capability src/engine/dsl/types.ts:BoundValue member=sourceSpark`: the `boundSourceSpark` descriptor still carries `pending: "member"` although hv-umm2.501 landed `SourceSparkValue`. `scripts/content-inventory.test.ts` passes, so only the CLI fails.
- `src/engine/triggers/matcher.ts` and `src/engine/continuous/layers.ts` each keep a private `instanceNumber(id)` helper; `src/engine/state/ids.ts` now exports the same function, which both could import.
- `src/cumulus/screens/MobileBattleScreen.tsx`: the `showPlayableOutline` doc comment says a ringed void card may be played from the void; it also rings a void card with an activated ability that works there.
