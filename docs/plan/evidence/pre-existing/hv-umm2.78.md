# Pre-existing issues found by hv-umm2.78

- `src/battle/components/EngineBattleScreen.tsx` (`browsedCards`) and `src/cumulus/screens/CardZoneBrowserOverlay.tsx`: the void browser renders card models without status badges, and the void pile shows no marker or playable outline while `affordances.voidPlays` is non-empty, so a void card's Reclaim, printed or granted, is visible only by opening the void chooser.
- `src/engine/rules/timing.ts` (`playRoutes`): a card with a printed "Reclaim N●" ability keeps its Reclaim route after an effect makes it lose the `reclaim` keyword, because the route also accepts any printed `reclaim` ability.
- `src/runtime/battle-prompt-messages.ts` (keyword status copy) and `src/screens/cumulus_adapters/engine-battle-view-model.ts` (floating keyword badge): a keyword gain is shown as "Gains Reclaim" with no cost, so a granted "Reclaim N●" (`reclaimCosts`) does not show its cost in the badge or the battle log line.
