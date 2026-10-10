# Pre-existing issues found in hv-n5lj.3

## Battle QA scenes never open

- **Where:** `src/state/game-journey-context.tsx` (`bootstrapQaScene`), at
  staging `074e0a05a`.
- **What:** for a scene that loads a battle (`qaSceneLoadsBattle`, for example
  `?goto=battle-playable`), the bootstrap passes the result of
  `createBattleInitProvider(...).beginBattle(...)` to `LOAD_STATE` as its
  `battle`. Since hv-n5lj.2 that result is a `BattleStart`
  (`{ battle, engineInit }`), not a `BattleFoldState`, so
  `validateLoadedState` rejects it, `LOAD_STATE` bounces with
  `invalid_action`, and the app waits on "Opening QA Scene" forever.
- **Workaround used:** `?goto=battle1&seed=<n>` and the Begin Battle button.
- **Fix direction:** load `start.battle` with its engine battle started from
  `start.engineInit` (or begin the battle through `BEGIN_BATTLE` after the
  scene loads), so the scene matches what `BEGIN_BATTLE` folds.
