# hv-n5lj.44 pre-existing issues

- **A second dev server on the same checkout can break the playable battle's
  first load.** While one runner served this worktree on port 5176, a second
  runner's dev server on port 5174 loaded `?goto=battle-playable&seed=1` with
  `[ErrorBoundary:screen:site] Game hooks must be used within a
  LocalGameProvider` from `PlayableBattleScreen`. The same scenario
  (`artifacts/qa/hv-n5lj.44/long-walk.mjs`) passed when run alone, and
  `battle-playable` loaded cleanly in every sequential run. Two Vite servers
  sharing `node_modules/.vite` and re-optimizing dependencies at once is a
  likely cause (duplicate React context modules); not investigated further.
- **The `hv-n5lj.8` tutorial walk is stale.** The bead-local
  `artifacts/qa/hv-n5lj.8/tutorial.mjs` waits for a `Begin` button the
  current main menu (`/main`) does not show, so it fails at its first beat.
  Bead-local scenarios are not maintained; a tutorial walk worth keeping
  belongs in `scripts/qa/scenarios/`, split per viewport.
