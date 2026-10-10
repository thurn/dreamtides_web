# Pre-existing issues found by hv-n5lj.37

- `src/battle/ui/engine-card-model.ts`, `src/cumulus/components/card/CardView.tsx`:
  a multi-cost card (`energyCosts`, such as `["2", "X"]`; nine catalog cards)
  shows its dealt definition's orb labels rather than the engine's cost, so a
  battle cost modification, or a per-copy cost reduction on a second copy,
  does not show on its orbs.
