# Pre-existing issues found by hv-umm2.58

- `src/battle/components/` (choice-prompt controls of the mobile battle screen): at 390×844, a `chooseMode` prompt whose option labels wrap onto a second full-width row places that row under the held card of the play awaiting its mode, at the left of the near hand row, which covers the start of the option's label (judged fail on Crimson Pilgrimage 01d53e49-7833-4122-a970-b72c73ad2c28 as player, mobile; capture `crimson-mode-overlap-mobile.png`).
- `docs/plan/evidence/content-inventory.json` is stale against `scripts/content-inventory.ts` (`npx tsx scripts/content-inventory.ts --check` fails at base e49920e4c).
