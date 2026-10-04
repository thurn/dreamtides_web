# Phase 1: Workflow Introspection

**Goal:** make the agent's edit → validate → promote loop fast and measured,
before the codebase grows by a full engine and ~750 definitions. Every
optimization must show a measured improvement. If a change doesn't improve its
target metric, revert it.

**Read first:**

- [workflow](workflow.md);
- `scripts/review.mjs` and `scripts/review-plan.mjs`;
- `vitest.config.ts`;
- `eslint.config.js`;
- `.tollgate/config.toml`.

**Out of scope here:** deleting whole systems. That belongs to Phase 2.
Triage tests only in areas that survive Phase 2, so effort isn't spent on
tests about to be deleted.

## Tasks

These are already filed as epic `hv-b8ef`. The tasks chain in this order:

| Section | Bead |
| --- | --- |
| 1.1 Baseline measurements | `hv-b8ef.1` |
| 1.2 Unattended-run hygiene | `hv-b8ef.2` |
| 1.3 Feedback-loop speedups | `hv-b8ef.3` |
| 1.4 Test triage | `hv-b8ef.4`, plus any area beads it files |
| 1.5 Mason pass | `hv-b8ef.6`, plus the beads it files |
| 1.6 Phase gate | `hv-b8ef.5` |

Additional area beads for 1.4 are chained before `hv-b8ef.6`. Beads filed by
the mason pass are chained before `hv-b8ef.5`.

### 1.1 Baseline measurements

Run on a fresh worktree after `npm install`, with `JOURNEY_TEST_WORKERS=2`.
Record in `docs/plan/evidence/metrics.md` the command, the result, and the
cache state (cold or warm) for each of these:

- **Workspace:** `node scripts/prepare-workspace.mjs`, cold and warm.
- **Gate steps:** each `review:full` step separately: `prepare`,
  `trox-source-check`, `ron-format-check`, `rust-format-check`, `rust-test`,
  `clean-game-data`, `lint`, `typecheck`, `test`. Run with `node -e` wrappers
  or `/usr/bin/time`.
- **Trox:** `npm run trox:gate`.
- **Slowest tests:** per-file test durations, from
  `npx vitest run --reporter=json --outputFile=<tmp>`. Record the top 40 files
  and the total.
- **Lint rules:** per-rule cost, from `TIMING=all npx eslint .`. Record the top
  20 rules, including the custom ones in `eslint-rules/`.
- **Typecheck:** `tsc --noEmit` wall time.
- **Review latency:** `npm run review` for three representative staged
  changes:
  - a one-line logic change in `src/rules/journey/`;
  - a docs-only change;
  - a one-value edit in a `data/*.ron` file.
- **Gate total:** the full Tollgate gate wall time from this bead's own
  candidate. Use the per-step `elapsed_ms` in
  `.git/tollgate/state.sqlite3` (`step_attempts.attempt_json`).

Then propose **budgets**. They are monitored, never gated. Examples:

- `npm run review` for a typical one-file change: ≤ 45 s.
- A focused test file: ≤ 5 s.
- The full Tollgate gate at 2 workers: ≤ 5 min.

**Acceptance:**

- `metrics.md` has every number with reproduction commands.
- The budgets are written down.
- Steps that Phase 2 deletes are measured too, for the baseline: trox, Rust
  game-data, RON formatting. The Trox entry in `pre-existing-issues.txt` is
  left for Phase 2.4, which deletes Trox. The pre-flight run of the gate
  passed: `trox` 47.4 s, `review` 228.4 s.

### 1.2 Unattended-run hygiene

1. **Context diet.** Trim `AGENTS.md` to durable invariants and pointers,
   under ~120 lines. Keep every invariant that
   [README](README.md#global-invariants) lists. Procedural detail moves into
   the project README in Phase 2.1, which also cuts the docs and skills
   (D33).
2. **Ignored paths.** Add `artifacts/qa/` to `.gitignore`. `logs/` is already
   ignored, which covers `logs/tournaments/` and `logs/fuzz/`; verify it.
3. **Tollgate.** The trusted policy `~/dreamtides_web/.tollgate/config.toml`
   is local and untracked; `.git/info/exclude` excludes it. Pre-flight
   installed the prototype's `dependencies → trox → review` pipeline with
   `JOURNEY_TEST_WORKERS = "2"` (D17). Verify it with `tg --no-launch config
   explain`. Change it only through `tg --no-launch config validate`, then
   `tg --no-launch config apply`. Only two kinds of beads may change it:
   Phase 1 beads whose purpose is gate speed, and the Phase 2 beads that
   delete Rust (2.3) and Trox (2.4). Record the old and new config in
   `metrics.md`, because the file is not versioned.
4. **Deploy docs.** Remove the deploy instructions from always-loaded guidance.
   Deployment is operator-only and outside this run.

**Acceptance:**

- `AGENTS.md` is under ~120 lines and keeps every invariant.
- The Tollgate config uses 2 workers.
- A full gate passes with the new config.

### 1.3 Feedback-loop speedups

Try each candidate below in isolation. Measure before and after, with one cold
and three warm runs. Keep it only if its target metric improves by ≥10% with no
regression elsewhere. Record the results in `metrics.md`.

- **ESLint cache:** `--cache --cache-location node_modules/.cache/eslint`, in
  `review.mjs` lint steps. Don't optimize custom rules here; Phase 2.7 culls
  them.
- **Incremental typecheck:** `--incremental --tsBuildInfoFile
  node_modules/.cache/tsc/review.tsbuildinfo`, or `tsc -b`.
- **Vitest environment:** default to `node`, with `jsdom` only for files that
  need the DOM. Use `environmentMatchGlobs` or per-file pragmas. Measure the
  setup-file cost, and compare `pool: "threads"` with `"forks"`.
- **Test selection:** check how precise related-test selection is in
  `review-plan.mjs`. Over-selection costs time; under-selection costs
  correctness.
- **Vitest startup:** setup-file cost, and dependency pre-bundling
  (`deps.optimizer`).
- **Tollgate concurrency:** running `lint` and `typecheck` concurrently inside
  `review:full`. Only do this if the 6-core cap holds.

**Acceptance:** each kept change has its before/after numbers in `metrics.md`,
and the rejected ones are listed with their numbers.

### 1.4 Test triage (surviving areas)

Apply the behavior-contract rule from
[D19](decisions.md#d19-test-pruning) to every test file outside these areas:

- **Deleted in Phase 2:**
  - `src/coop/`, `src/eventlog/` transport and Firebase code, `src/firebase/`;
  - `src/editor/`, `src/image_viewer/`, `tabula/`, `src/cumulus/docs/`;
  - analysis scripts and alternate draft algorithms;
  - Trox and localization code;
  - the RON/game-data pipeline and its scripts;
  - every script outside the essential set (see Phase 2.7);
  - all custom ESLint rules, which Phase 2.7 triages.
- **Replaced in Phases 3–4:**
  - `src/battle/` sandbox and AI;
  - `src/rules/battle/` debug-edit automation and effect tables.

Steps:

1. **Write the ledger.** One line per file in
   `docs/plan/evidence/test-triage.jsonl`:

   ```json
   {"file":"src/rules/journey/shop.test.ts","verdict":"keep|delete|merge|rewrite","reason":"contract|impl-detail|ui-copy|duplicate|deleted-system|low-value-slow","notes":"…"}
   ```

2. **Execute it in area batches,** one bead per area: `src/rules/journey`,
   `src/screens`, `src/cumulus` (outside `docs/`), `src/data`, `src/state`,
   and so on. A `rewrite` turns implementation-detail tests into tests of the
   observable contract they were protecting.
**Acceptance:**

- Every surviving-area test file has a ledger verdict.
- Deletions and rewrites are promoted.
- `metrics.md` shows the new test count and runtime.
- No `contract` test was deleted.

### 1.5 Mason pass

Run the [mason pass](workflow.md#mason-passes) over the areas that survive
Phase 2, outside `src/battle/` and `src/rules/battle/`. Concentrate on what
this phase touched: `scripts/review.mjs`, `scripts/review-plan.mjs`, the test
setup, and the triaged tests. Skip findings in code Phase 2 deletes.

**Acceptance:** every bead the pass files is chained before the gate and
closed.

### 1.6 Phase gate

1. Re-measure the 1.1 set. Update `metrics.md` with a before/after table.
2. Run the [independent review](workflow.md#reviews) over the phase diff.
3. Close the epic.

## Exit gate

- Baselines and budgets are recorded.
- Hygiene and speedups have landed, with evidence.
- Triage is complete for the surviving areas.
- Every mason bead filed this phase has landed.
- The review is resolved.
- The gate passes at 2 workers.
