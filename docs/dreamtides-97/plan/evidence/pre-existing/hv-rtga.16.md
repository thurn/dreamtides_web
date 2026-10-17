# Pre-existing issues found by hv-rtga.16

- **`npm run review`, `lint` and `knip` remove the compiled D97 maps.** Their
  closing `restore-local-assets` stage leaves the worktree without
  `public/d97/maps/<map-id>.json` (and the D97 character sheets), so a dev
  server started afterwards plays the development dream through the
  `d97_dream_fallback` path, with `no character generator library` sprite
  findings, until `node scripts/prepare-workspace.mjs` runs again. Browser QA
  after a review must re-run workspace preparation first.
