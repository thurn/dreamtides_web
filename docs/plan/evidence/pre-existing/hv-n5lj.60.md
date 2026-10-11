# hv-n5lj.60 pre-existing issues

- `src/battle/components/EngineBattleScreen.tsx` (`warmEngineBattleLog` on
  every slice change) with `replayEngineBattle` in
  `src/rules/battle/engine-battle.ts`: the battle log's kept replay folds
  each new intent over its own slice objects, started from a fresh
  `start(init)`, so it never hits the shared adapter's memoized runs and
  runs every step and legality search of each live intent once more,
  deferred by `setTimeout` while the battle screen is mounted.
