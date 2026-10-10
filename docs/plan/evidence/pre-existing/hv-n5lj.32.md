# Pre-existing issues found by hv-n5lj.32

- **Cost filter labels** (`src/cumulus/screens/PoolViewerScreen.tsx`,
  `costFilterLabel`): the options `0` through `4` all return the "All costs"
  label, so the Pool Viewer's cost dropdown shows six "All costs" entries and
  a selected numeric cost reads as "All costs". Changing it changes the
  player-visible UI, so this mason bead leaves it.
- **ResizeObserver warning on opening the Pool Viewer**: opening it from the
  dreamscape journey menu (`?goto=dreamscape&seed=1`, desktop 1440×900)
  intermittently records "ResizeObserver loop completed with undelivered
  notifications." in `window.__caps.errors` (2 of 4 runs on the base commit
  f95a55326, 2 of 3 after this bead), which fails a scenario-runner run.
