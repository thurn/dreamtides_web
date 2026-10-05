# hv-47xj.25 measurements (identity audit as an ESLint rule)

## `npm run review` for a one-line src/ change

The probe appends `// measurement probe` to `src/card-type-change.ts`, runs
`JOURNEY_TEST_WORKERS=2 npm run review`, and reverts the line. Each run sees
only the probe line in its diff: the before runs use the clean base
`6166d8b75`; the after runs use `JOURNEY_REVIEW_BASE=HEAD` on the bead's
commit, so the bead's own files are not in the diff.

| Run | Load (1 min) | Wall | lint | typecheck | test-related | Test files |
| --- | --- | --- | --- | --- | --- | --- |
| before 1 | 8.04 | 16.2 s | 1.4 s | 1.0 s | 12.6 s | 60 |
| before 2 | 9.12 | 17.2 s | 1.9 s | 1.1 s | 13.2 s | 60 |
| after 1 | 5.56 | 14.2 s | 1.4 s | 1.0 s | 10.9 s | 59 |
| after 2 | 5.23 | 13.5 s | 1.4 s | 0.9 s | 10.3 s | 59 |

- The selected test set loses `scripts/domain-string-audit.test.mjs`, which
  parsed every file under `src/`, `scripts/`, and `eslint-rules/`; alone it
  ran in 1.6 s (1.4 s of test time).
- The identity checks now run inside the existing per-file lint step; the
  lint step's time for the probe file is unchanged at 1.4 s.
- Host load was lower for the after runs, so part of the roughly 3 s drop is
  load rather than the removed contract test.

## Whole-tree lint

`npm run lint:full` with the rule enabled: 14.6 s wall at host load 5.70,
zero findings. Before the inline suppressions were added, `npx eslint src/`
reported exactly seven findings, one at each surviving site of the audit's
central allowlists.
