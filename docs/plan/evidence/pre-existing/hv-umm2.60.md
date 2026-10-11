# Pre-existing observations for hv-umm2.60

- Fresh worktree `npm install` reported 17 dependency audit findings: 9 moderate, 7 high and 1 critical. The package/lock dependency graph is outside this card primitive's scope.

- A single printed X energy orb renders as 0 on the engine source card. `src/battle/ui/engine-card-model.ts:158-173` preserves X labels only from explicit `energyCosts`; a card with `energyCost: null` and no multi-orb list instead receives `characteristics.cost` (0). The actual card's X prompt admits one through four, and paying two spends two energy; `choose-player-prompt-desktop-first-harness.png` shows the source orb as 0. This renderer path is unchanged by this bead and lies outside its areas. D21 follow-up `hv-umm2.348` owns the adapter repair and desktop/mobile/enemy re-judgment.
