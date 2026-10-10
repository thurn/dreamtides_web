# Pre-existing issues found by hv-umm2.47

`npx knip`, after `npm run prepare-workspace`, at staging `9b5c70695` (before
this bead's change, and unchanged by it):

- **Unused files** that are run by path or loaded dynamically rather than imported, so knip needs
  them as `entry` points in `knip.jsonc`: `scripts/bench-engine.ts`,
  `scripts/content-inventory.ts`, `scripts/lib/report-resource-usage.mjs`,
  `scripts/qa/prelude.mjs`, `scripts/qa/run-scenario.mjs`,
  `scripts/qa/scenarios/smoke.mjs`, `scripts/review-related-tests.mjs`.
- **Unused export** `getCurrentOffer` in `src/draft/draft-engine.ts:467`.
- Without `npm run prepare-workspace`, knip also reports every
  `../primitives/tokens` import as unresolved, because the typed token
  mirror is a generated workspace file.
