# hv-umm2.2 pre-existing issues

- **Synthetic fixture layer Three is full.** `makeSyntheticAtlasData` in
  `src/testing/atlas-fixtures.ts` gives layer Three `siteCount {4, 4}` with
  Draft and Purge required, and lists it as known-Dreamsign eligible. Its
  carriers composed 5 sites against a maximum of 4, which the composition
  sweep did not catch because it asserted the literal range 3–6. The sweep
  now asserts the catalog range; placement refuses that fixture layer.
- **No catalog check that mandatory sites fit.** Nothing validates that a
  layer's home signature site, required sites, and Battle fit within its
  `siteCount.max`. The `mandatoryCapacityBehavior: "omit-fill"` setting
  covers the fill, but an over-full required list would still exceed the
  range without any known Dreamsign. Production data fits today.
