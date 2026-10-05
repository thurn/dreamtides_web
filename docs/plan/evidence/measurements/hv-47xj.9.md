# hv-47xj.9 measurements (2.4b Delete Trox)

## Removed

- **Repository files deleted:** 54 (`trox.ron`, `.trox-revision`,
  `localization/` with 8 RON files, `vendor/trox-runtime/` with 22 files,
  `src/runtime/localization/` with 6 files,
  `src/types/virtual-trox-bundles.d.ts`, and 15 scripts and script tests).
- **Script modules deleted:** 8 — `scripts/trox.mjs`, `scripts/bump-trox.mjs`,
  `scripts/sync-trox-runtime.mjs`, `scripts/trox-generated-check.mjs`,
  `scripts/trox-source-workspace.mjs`, `scripts/trox-vite-plugin.ts`,
  `scripts/generate-localized-runtime-templates.mjs`,
  `scripts/audit-player-localization.mjs`.
- **Test files deleted:** 8 (7 node, 1 jsdom) — `scripts/trox.test.mjs`,
  `scripts/bump-trox.test.mjs`, `scripts/trox-csv-sync.test.mjs`,
  `scripts/trox-generated-check.test.mjs`,
  `scripts/trox-source-workspace.test.mjs`, `scripts/trox-vite-plugin.test.ts`,
  `scripts/audit-player-localization.test.mjs`,
  `src/runtime/localization/context.test.tsx`. Test lines, net: −699.
- **Test cases removed from surviving files:** 3 Trox review-plan cases in
  `scripts/review-plan.test.mjs` and 1 localization-classification case in
  `scripts/cumulus-ui-boundary.test.mjs`.
- **npm scripts removed:** 13 (12 `trox:*` plus
  `audit:player-localization`); the `@trox/runtime` dependency and 11 more
  lockfile packages that only it pulled in.
- **Review steps removed:** `trox-source-check` (from `full`, `lint-full`,
  `lint`, and `quick`) and the unreachable `trox-generated-check` command.
- **Workspace phase removed:** the "localized runtime adapters" generator in
  `scripts/prepare-workspace.mjs`.
- **Diff:** 149 files, +281/−19,694 lines.

The domain-string audit (`scripts/domain-string-audit.mjs`, its test, and
`npm run audit:domain-strings`) stays: it guards branded-ID identity, not
localization.

## Clean-checkout check

`git clone --no-hardlinks` of the commit, `cargo` and `rustc` stripped from
`PATH`, then `npm ci` (5 s) and
`DREAMTIDES_LOCAL_ASSET_HOME=. JOURNEY_TEST_WORKERS=2 npm run review:full`
(61 s, host load 6.63 → 7.90): prepare, lint, typecheck, and 224 test files /
2,374 tests passed. No step invokes `cargo` or `rustc`.

## Tollgate policy (old/new)

Old:

```text
steps:
  dependencies
  trox    npm run trox:gate
          env TROX_ROOT=/Users/dthurn/.cache/quest-prototype/trox-604a79412034
              DREAMTIDES_LOCAL_ASSET_HOME="."
  review  npm run review:full   (needs trox)
          env DREAMTIDES_LOCAL_ASSET_HOME="."
              JOURNEY_TEST_WORKERS="2"
              TROX_ROOT=/Users/dthurn/.cache/quest-prototype/trox-604a79412034
cache path: tools/game-data/target (dead)
```

New:

```text
steps:
  dependencies  npm ci --prefer-offline --no-audit --no-fund
  review        npm run review:full   (needs dependencies)
                env DREAMTIDES_LOCAL_ASSET_HOME="."
                    JOURNEY_TEST_WORKERS="2"
cache paths: none
resources: max_buildsets = 2, repository_concurrency = 1
```

Applied with `tg config validate` then `tg config apply` before this bead's
candidate; active configuration digest
`68c1e461196bb5beffb66be94ec69f2e8a836078ef2c0d2fa4a63220817ee23a`.
