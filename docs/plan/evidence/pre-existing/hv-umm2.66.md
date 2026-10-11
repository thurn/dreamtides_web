# Pre-existing issues found by hv-umm2.66

- `src/runtime/battle-prompt-messages.ts:606` and `src/screens/cumulus_adapters/engine-battle-view-model.ts:454` describe a floating cost change by its filter's card type alone, so a subtype filter (and a cost-bounded filter) is presented as applying to every card of that type.
- `docs/plan/evidence/content-inventory.json` lists `selectorBounds` as not existing although hv-umm2.55 landed its bead; the inventory snapshot is not regenerated as primitives land.
