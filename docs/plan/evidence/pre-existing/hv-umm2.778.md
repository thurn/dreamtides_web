# hv-umm2.778 pre-existing issues

- `src/engine/effects/primitives/choose-subtype.ts:withChosenSubtype` replaces
  the `CHOSEN_SUBTYPE` sentinel only in fields named `subtype`.
  `CharacterPredicate.notSubtype` in `src/engine/dsl/types.ts` accepts the same
  subtype value, and `src/engine/dsl/selectors.ts` compares that exclusion
  literally. A deferred selector using `notSubtype: CHOSEN_SUBTYPE` therefore
  retains the sentinel and can include characters of the chosen type.
  This semantic substitution issue is outside hv-umm2.778's graph identity and
  existing resolution-binding scope. The parent session filed core-review follow-up `hv-umm2.780`, serialized
  after this repair and required by gate `hv-umm2.46`; this bead preserves
  the field policy.
