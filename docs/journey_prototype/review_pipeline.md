# Review Pipeline

The standard local pre-commit and work-item review command is:

```bash
npm run review
```

This command plans checks from the branch diff against `master`, including
staged, unstaged, and untracked files:

- Production data and generator changes run asset validation.
- Changed TypeScript application files run through the repository's typed
  ESLint scope.
- Type-affecting changes run the incremental TypeScript check.
- Changed source and data files run their related Vitest tests with one worker.
- Documentation-only changes complete without executable checks.

Set `JOURNEY_REVIEW_BASE=<revision>` to compare against a different revision.
The command prints the selected base and the duration of every executed stage.

## Focused commands

Focused test and lint paths are the normal iteration loop:

```bash
npm test -- src/draft/pool/variant-tides4.test.ts
npm run lint -- src/cumulus/screens/JourneyStartScreen.tsx
```

Without a path, `npm test` and `npm run lint` use the same diff-aware selection
as `npm run review`. Focused commands run immediately and do not acquire the
full-review resource slot.

TypeScript stores incremental build information under
`node_modules/.cache/journey-review/`. The cache is scoped to the worktree and is
safe to discard with `node_modules`.

## Exhaustive commands

The complete repository checks are explicit:

```bash
npm run lint:full
npm run test:full
npm run review:full
```

`npm run review:full` runs production asset validation, full typed ESLint,
TypeScript, and the complete Vitest suite. CI runs this command on pull requests
and pushes to `master`.

Use an exhaustive command for:

- test-runner, lint, TypeScript, or repository-wide configuration changes;
- cross-cutting architecture whose dependency surface is difficult to bound;
- release validation;
- an explicit request for full-suite evidence.

The exhaustive commands acquire one repository-wide slot under the common Git
directory. Linked worktrees queue only when they each request exhaustive work.
The waiting command prints the owning worktree and stage every 15 seconds, and
a lock whose wrapper and child PIDs have exited is recovered automatically.

## Promotion and deployment

Tollgate runs the tracked `npm run trox:gate` entry point as a voting
pre-promotion step before `npm run review:full`. The Trox gate verifies the
vendored runtime and the complete release extraction, validation, bundling,
clean-regeneration, and canonical-localization audit contract in a disposable
validation slot.

GitHub Checks runs `npm run review:full`. Production deployment runs
`npm run trox:release` before the application build as a defense-in-depth
packaging check. This keeps the deployment contract at the promotion boundary
without adding a second release-generation pass to GitHub Checks.

## CPU budgets

- Related-test review uses one Vitest worker.
- Other local Vitest commands use two workers by default.
- Set `JOURNEY_TEST_WORKERS=<count>` for an intentional local override.
- CI sets `JOURNEY_TEST_WORKERS=4`.
- Tests receive a 15-second ceiling so a loaded comprehensive run does not
  turn ordinary 6–9 second cases into false failures. Set
  `JOURNEY_TEST_TIMEOUT_MS=<milliseconds>` for an intentional override.
- ESLint uses two typed workers by default. Set `JOURNEY_ESLINT_WORKERS=1` for a
  low-memory environment.
- Test-file isolation remains enabled.

Heavyweight experiments and corpus bakes run through their explicit commands
and are scheduled separately from review.

## Development server ownership

`npm run dev` records its wrapper and exact child process groups under the
worktree's `node_modules/.cache/journey-dev/` directory. This state supports safe,
worktree-scoped inspection and cleanup:

```bash
npm run dev:status       # show managed servers across linked worktrees
npm run dev:stop         # stop the server owned by the current worktree
npm run kill-dev-servers # explicitly stop every managed linked-worktree server
```

Shutdown targets the recorded wrapper and child process groups. Stale state
files with no live PIDs are pruned during status checks.
