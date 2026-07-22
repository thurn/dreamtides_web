# Review Pipeline

The standard local pre-commit and work-item review command is:

```bash
npm run review
```

It runs production asset validation, typed ESLint, TypeScript, and the complete
Vitest suite in that order. The individual commands remain available as
`npm run validate`, `npm run lint`, `npm run typecheck`, and `npm test`.

## Cross-worktree resource slot

Every review command acquires one repository-wide slot under the common Git
directory. All linked worktrees share that directory, so expensive review jobs
queue instead of competing for CPU and memory. The waiting command prints the
owning worktree and stage every 15 seconds. A lock whose wrapper and child PIDs
have both exited is recovered automatically.

The slot covers the standard validation, lint, typecheck, and test commands.
Focused test arguments continue to work:

```bash
npm test -- src/draft/pool/variant-tides4.test.ts
npm run lint -- src/cumulus/screens/QuestStartScreen.tsx
```

## Check execution

- ESLint uses two typed workers by default. Set `QUEST_ESLINT_WORKERS=1` when
  measuring low-memory environments. The lint runner validates exact Cumulus
  debt baselines during the same traversal that reports ordinary lint errors.
- TypeScript stores incremental build information under
  `node_modules/.cache/quest-review/`. The cache is scoped to the worktree and
  is safe to discard with `node_modules`.
- Vitest uses a dedicated test-only config and a worker-thread pool capped at
  four workers or the host's available parallelism, whichever is smaller.
  Test-file isolation remains enabled.
- Asset generation and production-data validation run once as the validation
  stage. Unit tests exercise the catalog transforms with synthetic fixtures.

These bounds assume heavyweight experiments and corpus bakes are launched
through their own explicit commands. They should not be started as background
companions to a review run.

## Development server ownership

`npm run dev` records its wrapper and exact child process groups under the
worktree's `node_modules/.cache/quest-dev/` directory. This state supports safe,
worktree-scoped inspection and cleanup:

```bash
npm run dev:status       # show managed servers across linked worktrees
npm run dev:stop         # stop the server owned by the current worktree
npm run kill-dev-servers # explicitly stop every managed linked-worktree server
```

Shutdown targets the recorded wrapper and child process groups. Stale state
files with no live PIDs are pruned during status checks.

