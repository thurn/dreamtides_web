# Pre-existing issues found by hv-n5lj.40

- **The Transfiguration type list is copied privately in five modules**
  (`src/battle/card-definition.ts`, `src/rules/journey/deck.ts`,
  `src/rules/journey/sites.ts`, `src/data/exploration.ts`, and
  `dataFormIds` in `src/data/transfiguration-data.ts`); only some are checked
  against `TransfigurationType`. One exported, exhaustiveness-checked list in
  `src/types/journey.ts` would serve every decoder, including the journey
  battle parser in `src/rules/battle/fold.ts`.
- **Tutorial battle `LOAD_STATE` validation is structural for its init and
  board** (`asValidTutorialBattle` in `src/rules/journey/lifecycle.ts`): it
  checks the parked runs, prompt, and markers, but accepts any record as the
  `BattleInit` and the sandbox board.
