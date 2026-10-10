# Pre-existing issues found by hv-n5lj.7

- `scripts/dev.mjs`: starting a second dev server for a checkout (the card
  sweep's or the scenario runner's) rewrites workspace materializations that
  the first server's Vite watches, so every page open on the first server
  takes a burst of HMR updates and full reloads (seen as a page reloading
  mid-capture). Interactive QA beside a scripted run on the same worktree
  must re-check its page after the second server starts.
