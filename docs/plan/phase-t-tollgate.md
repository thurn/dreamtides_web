# Track T: Tollgate

**Goal:** make Tollgate fast to restart, then deliver staged validation
([D44](decisions.md#d44-staged-validation)) and adopt it here. That means:

- Tollgate opens its socket in seconds and never makes one repository's
  backlog block the others.
- Artifact pruning is cheap and runs in the background.
- A fast gate stage promotes to `staging`. A release stage validates the
  newest `staging` tip asynchronously and advances `release` and remote
  `master`.
- Skills and Hive use `staging` and `release` correctly.
- `dreamtides_web` runs a gate stage of about 60 s or less.

Track T beads run **between the phases' beads**, one at a time like every
other bead ([D43](decisions.md#d43-orchestrated-sequential-execution)). Its
work happens in
`~/tollgate`, except T8. The operator granted standing promotion authority for
Track T beads ([D45](decisions.md#d45-tollgate-track)).

**Read first:**

- `~/tollgate/AGENTS.md`, its `wt` flow, and its self-install rule;
- `~/tollgate/docs/technical-design.md` §§ 4–6, 9.8–10.9, 11.2, 11.5,
  12.6–12.7, 15. It specifies staged release, which is binding for Track T:
  terms (§4), invariants I1, I8, and R1–R5 (§5), the repository model and
  workflow (§6.2–6.3), and release advance and push (§10.9);
- this page's [incident record](#incident-2026-10-05).

**In `~/tollgate`, every bead** is implemented by a subagent, while the
orchestrator submits, approves, and self-installs it. Every bead:

- follows that repository's conventions;
- runs its local checks (`cargo test` for the touched crates, plus the UI
  tests when the UI changes), with `CARGO_BUILD_JOBS=4` (D17);
- promotes through Tollgate with standing authority;
- self-installs from the promoted `release` OID, restarts the app, and runs
  `tg --no-launch doctor`.

Install only when no `dreamtides_web` validation is running, and record each
restart's duration in the bead notes. Until T1a lands, a restart can take
hours. So T1a, then T1b, promote before any other Tollgate change.

## Incident 2026-10-05

A docs-only promotion (`74ae3fb`) triggered the required self-install. The
restarted app left every repository unavailable for about 100 minutes. The
diagnosis, with citations to `crates/tollgate-service/src/lib.rs` (service)
and `crates/tollgate-store/src/lib.rs` (store) at `74ae3fb`:

- **No socket until every repository activates.**
  `src-tauri/src/lib.rs:656` blocks on `TollgateService::open_default()`.
  That calls `load_registry`, which runs `register_existing` for each
  repository **in sequence** (service `:13795`). The IPC server starts only
  afterwards (`src-tauri/src/lib.rs:702-711`).
- **Activation prunes expired artifacts.** `register_existing` calls
  `prune_expired_artifacts` (service `:1723`), which is also run hourly by
  maintenance (`:1384`). Battlement had 23,113 expired artifacts (about
  940 MB) out of 116,041 retained.
- **Each prune is quadratic in effect:**
  - `store.artifact(id)` loads **all** retained artifacts to find one row
    (store `:997-1002`, `:941-995`, with an `ORDER BY` on an unindexed
    column);
  - about 4 lookups by `command_id` on `operation_intents`, which has no
    index on that column (about 90,000 rows);
  - two file hashes;
  - three `synchronous=FULL` transactions.

  Measured throughput was about 230 prunes per minute.
- **One bad artifact stops the loop.** The loop aborts at its first error
  (service `:9123`). `load_registry` then marks the repository unavailable,
  and it would fail again on every restart.
- **Recovery.** An operator-approved hotfix build (release `74ae3fb` with the
  activation prune removed, unpromoted) restored service in under 2 minutes.
  On that restart `rsp` failed activation with a `UNIQUE constraint failed:
  seed_generations…` error in startup recovery. That is a separate recovery
  bug, and T1a covers it.

## Task graph

Each task depends on the tasks listed after its arrow:

- T1a: none. It starts at once.
- T1b ← T1a; T2 ← T1b; T3 ← T2; T4 ← T3; T5 ← T4; T6 ← T5; T7 ← T6
- T8 ← T6
- T9 ← T6, Phase 2.4b (both change the local Tollgate policy; 2.4b removes
  the trox step)
- T10 ← T7, T8, T9

| Task | Bead |
| --- | --- |
| Epic | `hv-ki3p` |
| T1a | `hv-ki3p.1` |
| T1b | `hv-ki3p.2` |
| T2 | `hv-ki3p.3` |
| T3 | `hv-ki3p.4` |
| T4 | `hv-ki3p.5` |
| T5 | `hv-ki3p.6` |
| T6 | `hv-ki3p.7` |
| T7 | `hv-ki3p.8` |
| T8 | `hv-ki3p.9` |
| T9 | `hv-ki3p.10` |
| T10 | `hv-ki3p.11` |

Track T beads run in task order: they all touch the same Tollgate service
and store modules. T8 and T9 work in other repositories.

## Tasks

### T1a. Socket-first startup and isolated activation (core-review)

Change startup so the socket opens before any repository work:

- **Bind the IPC socket first.** Repositories then activate in the
  background, at most 3 at a time.
- **Report activation state.** Until a repository is active, its commands
  return a typed `repository-activating` result with progress. `tg status`
  and `tg doctor` show it. Fix the ordering hazard: a runtime is inserted into
  the shared map (service `:1703`) before its recovery runs. Commands must not
  see a half-recovered runtime.
- **No pruning during activation.** Remove `prune_expired_artifacts` from
  activation. Maintenance owns it (T1b).
- **Contain failures.** One repository's activation failure marks only that
  repository unavailable, with its error and recovery action. The others are
  unaffected.
- **Fix the `rsp` seed-generation failure.** Reproduce the `seed_generations`
  unique-constraint failure in startup recovery and fix it in Tollgate code.
  Never hand-edit a repository's state.
- **Replace the hotfix.** This bead's self-install replaces the unpromoted
  hotfix build.
- **Install script.** `scripts/install-local.sh` treats a bound socket plus a
  passing `doctor` as healthy, then prints per-repository activation progress
  until all are active or have failed.

**Acceptance:**

- A test with a fake repository whose activation blocks shows the socket
  answering `status` and `doctor` while that repository is still activating.
  Commands to it return `repository-activating`; other repositories serve
  normally.
- A test shows one failing activation leaves the others active.
- The startup path never calls the artifact prune; a test pins it.
- A regression test covers the seed-generation recovery failure, and `rsp`
  activates.
- Measured: restart to healthy `doctor` with the real registry. Record it in
  the bead notes. Expected: seconds.

### T1b. Artifact prune performance and background pruning

- **Single-row lookups.** Add `store.artifact(id)` as a primary-key lookup.
  Add indexes on `operation_intents(command_id)` and on the artifact expiry
  columns the prune query filters. Do it in a schema migration that runs
  `ANALYZE`.
- **Batched, bounded pruning.**
  - The maintenance sweep prunes in batches of at most 200 artifacts.
  - Each batch is one durable intent plus one transaction. Keep crash safety:
    recovery completes or rolls back a batch exactly.
  - The sweep yields between batches, so configuration observation, pulls,
    and queue work for every repository keep running.
- **Hash once.** Verify each artifact once per prune, not twice, unless the
  verification contract needs both. If it does, record why in the code.
- **Contain failures.** A prune error records that artifact as
  `needs-attention` and the sweep continues. It never makes a repository
  unavailable.

**Acceptance:**

- Store tests on a synthetic store with 100,000 retained artifacts and
  90,000 completed intents show:
  - a single-artifact lookup reads one row;
  - a batch prune issues a bounded number of statements per artifact.

  Use query counting, not timing.
- A crash-injection test covers each batch boundary.
- A failing artifact is recorded and the sweep continues.
- Measured before and after on the synthetic store: prunes per second.
  Record it in the bead notes, and in `~/tollgate` docs if that repository
  keeps metrics.

### T2. Stage configuration

Technical design §11.2 (schema) and §11.5 (configuration changes):

- `stage` on steps;
- `release_concurrency` and `max_release_lag`;
- `sync_user_master` values;
- per-stage digests;
- schema and `config explain`.

Release-stage steps are rejected until T4.

**Acceptance:** config and schema tests cover each new key, the graph rules,
and digest independence between stages.

### T3. `staging` and `release` refs (core-review)

Technical design §6.2 (repository model), §8.3 (logical data model), and
§19.1 (startup reconciliation):

- create `staging` and migrate existing repositories;
- split `INTEGRATION_REF`;
- protect both refs from checkout;
- add the JSON fields;
- the opt-out two-ref transaction (R5).

**Acceptance:**

- A migration test on a repository with an active queue invalidates no
  generation.
- The full existing promotion and push suite passes unchanged for an opt-out
  configuration, with `staging == release` after every event.

### T4. Release runs (core-review)

Technical design §9.8 (queue item and buildset states), §12.7 (release
runs), and §15.1–15.3 (resources, priority, and pause):

- `QueueItemKind::Release`;
- the runner's stage filter;
- range path filters;
- the `release_concurrency` permit and priority;
- the durable trigger intent, spawned outside the mutation lock;
- coalescing to the newest tip;
- outcomes and notifications.

**Acceptance:** the coalescing, lock-discipline, and range-filter tests in
technical design §21.1–21.3.

### T5. Release advance and push (core-review)

Technical design §5 (invariants I1, I8, R1–R5), §10.1–10.7 (promotion,
push, external movement, pull, push and reconciliation), and §10.9 (release
advance and push, `max_release_lag`, `--release-fix`):

- the release intent and CAS;
- the relocated remote preflight and push barrier;
- recovery;
- `max_release_lag`;
- the `pull`, `push`, `reconcile`, and external-movement changes;
- `tg approve --release-fix <id>`: a candidate approved this way bypasses the
  `max_release_lag` pause, so the fix for a red release can always land.

**Acceptance:**

- R1–R5 property tests.
- Fault injection at every durable boundary.
- The technical design §21.2 end-to-end fixture: three fast promotions, one
  coalesced release run, and the remote receiving only the newest tested OID.

### T6. Surfaces

Technical design §16.1–16.2 (CLI), §17.4–17.5 (Release panel and
operations), and §17.7 (notifications):

- `tg status` with both refs and lag;
- `tg release status` and `tg release retry`;
- `tg wait --released`;
- notifications;
- the desktop Release panel.

**Acceptance:**

- CLI JSON contract tests.
- UI tests for the panel.
- A screenshot of the panel in the bead notes.

### T7. Fold the design into the technical design

`~/tollgate/docs/technical-design.md` and the Tollgate README describe staged
release as implemented. The technical design is the single design document;
this plan cites its sections.

### T8. Skills and Hive

Update every consumer of the ref model:

- **`~/.llms/skills/wt/SKILL.md` and `wt-sequence/SKILL.md`:**
  - worktrees base on `staging`;
  - a task is complete when promoted to `staging`; report `release` lag and
    state;
  - `tg wait --released` only when the user asks for the result to be live;
  - a red release run is fixed by a follow-up commit;
  - local `master` follows `sync_user_master`.

  Commit only these paths in the home repository. Never push.
- **`~/hive/skills`** (`executor`, `independent-review`, `weaver`,
  `archivist`, `visual-review`, and `shared/`) **and `~/hive/src`:** audit
  every `release` reference. Most mean "base new work here" (`staging`) or
  "is it landed" (`staging`). The remote and self-install references mean
  `release`. Deliver through Hive's own `wt` flow.

**Acceptance:**

- `grep -rn 'release'` over the touched skills shows only intended uses.
- Hive's test suite passes.

### T9. Adopt staged validation in `dreamtides_web`

- **Gate script.** Add `npm run review:gate` to `scripts/review.mjs`:
  - `prepare`;
  - full `typecheck`;
  - lint of the files changed against `HEAD^`;
  - tests related to `HEAD^`, capped at 40 files. Over the cap, the step logs
    the selection size and skips, and the release stage covers the rest.
- **Local Tollgate policy:**
  - steps: `dependencies` and `review:gate` in the gate stage; `review:full`,
    plus `fuzz:engine -- --games 200` once Phase 3.2 has added it, in the
    release stage;
  - `max_buildsets = 2`, `repository_concurrency = 1`,
    `release_concurrency = 1`, `max_release_lag = 5`;
  - `sync_user_master = "staging"`.

  Change it through `tg config validate` then `apply`. Record the old and new
  text in `metrics.md`.
- **Switch over.** The orchestrator switches to the
  [staged mode](workflow.md#staged-validation) of the workflow from the next
  dispatch.

**Acceptance:**

- Measured: the gate stage takes at most 60 s for a typical one-file change,
  with host load recorded.
- One bead lands on `staging`, then a release run advances `release` and
  remote `master` to it.
- The policy texts are in `metrics.md`.

### T10. Track gate

1. Run the independent review over the Track T diff in `~/tollgate`, from
   T1a's parent to the T7 head, and over the T8 and T9 diffs.
2. Run a restart drill: restart Tollgate with every repository registered.
   Record the time to a healthy `doctor` and to all repositories active.
3. In one `dreamtides_web` commit:
   - write the Track T beads' friction files from their notes;
   - point the plan's citations of Tollgate's design at
     `technical-design.md` sections.
4. Close the Track T epic.

## Exit gate

- Restarts are fast, and no repository's backlog blocks another.
- Staged validation is live for `dreamtides_web`, and `release == staging`.
- Skills and Hive are consistent with the ref model.
- The reviews are resolved.
