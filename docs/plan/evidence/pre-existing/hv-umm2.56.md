# Pre-existing issues found by hv-umm2.56

- `docs/plan/engine-design.md` § Ability DSL and content modules, primitive catalog, Cards row: `reveal` is registered (`src/engine/effects/primitives/reveal.ts`) but is listed only in the Phase 5 column, not among the registered primitives.
- `src/screens/cumulus_adapters/prompt-host-view-model.ts` with `src/cumulus/screens/MobileBattleScreen.tsx`: a `chooseCards` prompt whose candidates are all in the opponent's hand is answered on the board, where the far-hand row sits under the prompt banner on desktop (1440×900) and mobile (390×844), so the human cannot tap any candidate (also recorded by hv-umm2.57).
