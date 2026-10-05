# hv-47xj.15 measurements (2.7b Cull custom ESLint rules)

## Rule counts

| | Before | After |
| --- | --- | --- |
| Custom rule modules in `eslint-rules/` | 18 | 8 |
| Config-level restriction blocks (`no-restricted-*`, `max-lines`) | 6 | 2 |
| Files in `eslint-rules/` | 40 | 18 |
| Lines in `eslint-rules/` | 6,738 | 2,008 |

Kept rule modules, now under the `dreamtides/` plugin prefix:

- `no-name-keyed-cards`: card names are not unique (AGENTS.md). Applies to
  all of `src/`, and also reports equality comparisons of card names.
- `valid-token-references`: a misspelled `var(--token)` drops the declaration
  silently.
- `no-composed-type-voice`: a `--t-*` voice composed with other parts is an
  invalid `font` shorthand that the browser drops.
- `no-untokenized-lengths`: Cumulus spacing and radius tokens.
- `no-hardcoded-values`: Cumulus color tokens.
- `no-raw-interactive-elements`: hand-rolled controls lack Pressable's
  keyboard focus and press handling.
- `no-raw-icon-classes`: a raw Boxicons class renders a blank box when it is
  misspelled.
- `no-raw-safe-area-env`: a raw `env(safe-area-inset-*)` reads 0 in the QA
  device frame.

Kept restriction blocks: determinism in `src/rules/` (`Math.random`,
`Date.now`, `Date.parse`, `new Date()`) and `localeCompare` in
`src/journey_v2/encounter/generateAuguryEncounter.ts`.

Deleted rule modules: `no-adhoc-press-scale`, `no-classname-in-product-ui`,
`no-entity-reveal-escape-hatches`, `no-escape-hatch-props`,
`no-external-ui-imports`, `no-inline-glass`, `no-numeric-style-props`,
`no-purple-text-on-glass`, `screen-file-taxonomy`, `thin-adapters`, and the
helper modules `cumulus-containers.js` and `ui-boundary-roles.js`. Deleted
restriction blocks: adapter `max-lines`, view-model import purity,
`src/cumulus/internal/` reach-in, and the `src/eventlog/` import boundary.
The Firebase and React import bans in `src/rules/` were dropped as well.

Each kept rule checks code shape only. `files` and `ignores` globs in
`eslint.config.js` set its scope.

## Lint time

Full `src/` lint (1,544 files, ESLint `concurrency: 2`). The before and after
configurations ran alternately in one process, three times each, with ESLint
`stats` enabled:

| Run | Config | Host load (1 min) | Wall | Custom-rule time |
| --- | --- | --- | --- | --- |
| 1 | before | 12.59 | 14.8 s | 220 ms |
| 2 | after | 11.72 | 16.2 s | 74 ms |
| 3 | before | 11.43 | 14.6 s | 219 ms |
| 4 | after | 10.82 | 13.3 s | 57 ms |
| 5 | before | 11.34 | 14.8 s | 243 ms |
| 6 | after | 12.21 | 15.8 s | 83 ms |

`npm run lint:full`, lint step: 13.2 s before (load 14.65) and 13.5 s after,
inside `review:full` (load 9.09).

Custom rules cost about 0.2 s of the roughly 19 s of rule CPU time. Type-aware
`typescript-eslint` rules account for the rest. The wall time therefore stays
the same within host-load noise, and this cut gives no lint speedup.

## Tests

- 14 test files deleted: 11 rule tests in `eslint-rules/` and
  `scripts/cumulus-ui-boundary.test.mjs`,
  `scripts/cumulus-outer-css-integrity.test.mjs`, and
  `scripts/cumulus-ui-baselines.test.mjs`. All of them run in the node
  environment.
- The 8 kept rule tests drop their path-scope cases. Test lines, net: −2,662.
- `JOURNEY_TEST_WORKERS=2 npm run review:full`: 45.9 s, host load 9.09,
  210 files and 2,089 tests passed.
