# hv-umm2.478 pre-existing observations

- `scripts/setup-assets.ts` (run by `scripts/prepare-workspace.mjs`, which
  `scripts/dev.mjs` and the runner's `--prod` build run first) is not safe to
  run twice at once in one checkout: two concurrent runs from one worktree
  failed with `symlinkSync` EEXIST on a `public/cards/*.webp` link. The runner
  now serializes server startup per checkout; an interactive `npm run dev`
  started beside a runner in the same worktree can still race it. Making the
  asset links idempotent is outside this bead's areas.
- Fresh dependency installation reported npm audit findings; dependency repair
  is outside this bead.
