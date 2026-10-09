# Workflow

This page tells the executing session how to do the work. The phase pages say
what the work is.

The rules here combine three sources:

- the Hive executor role (`executor`, `bead`, and `justiciar` skills; see
  `~/hive/skills/`);
- the global `wt` skill (`~/.llms/skills/wt/SKILL.md`);
- this repository's [AGENTS.md](../../AGENTS.md).

Where they differ, the [decisions](decisions.md) win, then AGENTS.md.

## Identity and scope

- **There is one orchestrating Claude Code session**
  ([D43](decisions.md#d43-orchestrated-sequential-execution)). Its actor is
  `"${CLAUDE_CODE_SESSION_ID:?}"`, expanded inside the same command as each
  Beads call.
- **Work is sequential.** One bead runs at a time, implemented by one
  subagent, and lands on `staging` before the next bead starts. At most one
  Claude subagent of any kind runs at a time. Subagents share the parent's
  session ID, so **only the orchestrator** calls Beads, the Tollgate queue,
  or `tg worktree`. See [Dispatch](#dispatch).
- **The Hive project is `dreamtides_web`.** Track T beads are filed in it,
  even though they change `~/tollgate` ([D45](decisions.md#d45-tollgate-track)).
  Never claim, edit, or close beads of another project.
- **Continuous mode is explicitly authorized.** Dispatch the next ready bead
  as soon as the previous one lands, until the Phase 7 epic closes.
- **The run ends when the Phase 7 epic closes,** with the Track T epic also
  closed. Nothing is filed to run after it. The session then stops.
- **The run is silent.** Send no push notifications or other outbound
  messages. Progress lives in bead notes and the session title.

## Beads

Define the routing prefix in every shell command that touches Beads:

```sh
hbd() { env BEADS_DIR=/Users/dthurn/brain/.beads BEADS_DOLT_AUTO_START=0 BD_NON_INTERACTIVE=1 BD_NO_HOOKS=true bd --sandbox --dolt-auto-commit off --actor "${CLAUDE_CODE_SESSION_ID:?}" "$@"; }
```

**Never initialize a store, start a second server, or fall back to another
database.** The operator authorizes restarting the configured Dolt server when
it is down; see [recovery](#failure-and-recovery).

### Filing a phase

File a phase as soon as its **earliest start** (stated on its phase page) is
reachable within the next few dispatches. Do not wait for the previous gate.
Phases 2 and 3 and Track T are already filed.

1. **Create the epic.** Create it ready, then inspect it.

   ```sh
   hbd create --type epic --priority 1 --title 'Phase 4: Battle UI on the engine' \
     --description 'See docs/plan/phase-4-battle-ui.md. ...' \
     --acceptance '<the phase exit gate, copied from the phase page>' \
     --metadata "{\"hive_project\":\"dreamtides_web\",\"hive_origin_thread\":\"${CLAUDE_CODE_SESSION_ID:?}\"}" --json
   ```

2. **Create one child per task on the phase page.** Give each:
   - `--parent <epic>`;
   - a description that names its phase-page section and its scope, and ends
     with an `Areas:` line (see [Areas](#areas)) that carries its hub areas
     and the fallout areas its
     [fallout listing](#listing-fallout-before-dispatch) calls for;
   - acceptance criteria copied from the phase page;
   - `hive_origin_thread` metadata;
   - the label `core-review` where the page marks it.

   Omit `hive_project` for now: the child has prerequisites.

3. **Add the edges in the phase page's task graph,** and only those:
   `hbd dep add <child> <prerequisite>`. Never chain beads that the graph
   leaves unordered; selection order sequences them.
   - The mason task depends on every implementation task.
   - The gate task depends on the mason task and on the previous phase's
     gate task.

   Inspect the edges with `hbd show <id> --json`, and run `hbd dep cycles`.
4. **Make the children selectable.** Only after the edges are correct, set
   `--set-metadata hive_project=dreamtides_web` on each child.
5. **File content batches separately.** The orchestrator files the Phase 5
   batches from the inventory after the inventory task lands, because their
   composition depends on it. Use the same pattern.
6. **Cross-phase edges to unfiled beads** are added when the later of the
   two beads is filed. For example, filing Phase 6 adds 6.1's edge to the
   Phase 5 batch with the Tutorial card.

**Follow-up work gets a new bead** with the right edges. It never gets a
reopen.

**A newly discovered prerequisite of a running bead** gets a new bead and an
edge. Then:

1. The running bead's subagent makes an unvalidated checkpoint commit in its
   worktree and returns.
2. The bead keeps its worktree and stays claimed. Its notes record the
   checkpoint.
3. The orchestrator dispatches the prerequisite.
4. After the prerequisite lands, a new subagent rebases the checkpoint with
   `tg update`, finishes, and amends it into the bead's single commit.
[Introspection](#introspection) improvement beads, `ci-fix` beads, and
review follow-ups are filed the same way. They preempt other ready work
(below).

### Areas

Every bead description ends with one line:

```text
Areas: src/rules/journey/, src/content/economy.ts, fold hubs, fallout: SiteState
```

- An area is a directory prefix, a file, a [hub area](#hub-areas), or a
  [fallout area](#fallout-areas).
- These are each a single area: `package.json` with `package-lock.json`,
  `eslint.config.js`, `vitest.config.ts`, `tsconfig*.json`, `scripts/review*.mjs`,
  the local Tollgate policy, `docs/rules.md`, the plan pages with
  `metrics.md`, and `AGENTS.md`.
- Per-bead ledger files are always in scope (see
  [Evidence files](#evidence-files)).
- Track T beads list paths in `~/tollgate` or the other repositories they
  touch.

Areas bound what the subagent may change. If a subagent discovers it must
change something outside its areas, it stops and reports. The orchestrator
widens the bead's areas when the change belongs to the bead, or files the
change as a new bead.

A gate bead's long checks (soaks, playthroughs, reviews) hold no areas. It
takes the plan-pages area only to commit its evidence.

#### Fallout areas

`fallout: <exported symbol or file>` covers the edits `tsc` forces wherever
that symbol, or any export of that file, is imported or constructed:

- import lines and re-exports;
- call-site arguments and type annotations;
- renamed or deleted identifiers;
- a neutral value for a new required field in test fixtures and synthetic
  builders;
- re-stamped replay fixture hashes.

A fallout edit keeps behavior. Any other change outside the bead's areas
still stops the subagent: a changed branch, value, rendered output, log line,
or test assertion.

Name a fallout area for every exported type, field, or signature the bead
changes or deletes. Name the file instead when the bead reshapes most of its
exports.

#### Hub areas

A hub area names the shared files most features in a layer touch. It grants
the same rights as any area. Write its name in the `Areas:` line.

- **`engine hubs`**, taken by every bead that changes `src/engine/`:
  - `src/engine/state/`: state types, initial state, clone, hash and
    serialization, ids;
  - `src/engine/steps/*.ts`: the runner, context, driver, sources, errors,
    and types (not `steps/kinds/`);
  - `src/engine/prompts/`, `src/engine/events/index.ts`, and new modules in
    `src/engine/events/kinds/`;
  - `src/engine/effects/types.ts`, `src/engine/view/view.ts`,
    `src/engine/fold/slice.ts`;
  - `src/engine/engine.ts`, `index.ts`, `catalog.ts`, `content-catalog.ts`,
    and `log.ts`;
  - `src/engine/testing/`: synthetic cards, fixtures, the fuzz pool,
    policies, invariants;
  - `src/content/battle.ts` (battle tunables) and
    `docs/plan/engine-design.md`.
- **`fold hubs`**, taken by every bead that adds, changes, or removes an
  intent, a fold-state field, or a genesis input:
  - `src/rules/events.ts`, `src/rules/reducer.ts`, `src/rules/fold-state.ts`;
  - `src/session/actions.ts`, `src/session/genesis.ts`,
    `src/session/reducer-version.ts`;
  - `src/rules/replay/` and `scripts/regenerate-replay-fixtures.mjs`.

#### Listing fallout before dispatch

Before writing or dispatching a bead's `Areas:` line, the orchestrator lists
the importers of every exported symbol the bead will change. From the
worktree root:

```sh
# The symbols the bead changes or deletes:
git grep -lwE 'SiteState|SiteGenerationContext' -- src scripts

# Every export of a file the bead reshapes:
f=src/engine/state/types.ts
syms=$(grep -oE '^export (declare )?(abstract )?(async )?(interface|type|function|const|let|class|enum) [A-Za-z0-9_]+' "$f" | awk '{print $NF}' | paste -sd'|' -)
git grep -lwE "$syms" -- src scripts
```

- Append `| grep -E '\.test\.tsx?$'` to see the test files alone.
- The lookup follows barrels (`src/engine/index.ts`) and type-only imports. It
  over-lists short common names; read the hits.
- It misses a value built through a parent type with no named import. The
  subagent's compile check in the [brief](#implementation-brief) finds those.
- `review:gate`'s related-test lookup (`scripts/review-related-tests.mjs`)
  selects transitive test files, not direct importers. It does not list
  fallout.

Every listed file outside the bead's areas gets a fallout area, a hub area, or
a wider area.

### Selection order

At every dispatch boundary, pick from `hbd ready` (filtered to
`hive_project=dreamtides_web`, task beads only, never epics). Use this
priority order:

1. `ci-fix` beads, which fix a red release run or a failed candidate on an
   already-promoted base;
2. introspection, review-follow-up, and `test-cut` beads;
3. the lowest phase number first, then Track T, then later phases;
4. within a phase, page order.


### Claiming and working

- **Claim on dispatch,** never before: `hbd update <id> --claim --json`, by
  the orchestrator. Proceed only on acknowledgement. Per D43, the orchestrator
  holds one claimed bead, plus any bead checkpointed behind a prerequisite.
- **Retitle the session** with the native title tool: `set_session_title` on
  session `self`, in the Claude desktop app. Use
  `⚒️ [<id>] <phase summary>`. A failed rename is reported and
  retried; it never blocks.
- **Record transitions** with `hbd update <id> --append-notes '...'`:
  - worktree path, branch, and the subagent's agent ID;
  - candidate ID and source OID;
  - key measurements;
  - decisions made;
  - review dispositions;
  - blockers and next action.

  Update at meaningful transitions, not every tool call.

### Closing

Close a bead when its commit has **landed**:

- **Interim mode:** Tollgate reports the candidate promoted, `release`
  contains the tested OID, and remote `master` equals `release`.
- **Staged mode:** the candidate is promoted to `staging`.
- **Track T beads:** the candidate is promoted in its own repository, and
  for `~/tollgate` the orchestrator has self-installed it and `doctor` is
  healthy ([D45](decisions.md#d45-tollgate-track)).

In every mode, the worktree must be cleaned up.

```sh
hbd update <id> --set-metadata hive_resolution=completed --append-notes 'Landed <tested-oid> via <candidate-id>; evidence: ...'
hbd close <id> --reason '<one-line outcome>'
```

A gate bead closes only when all of these hold:

- its [retrospective](#retrospectives)'s beads have closed;
- its review is resolved;
- its phase evidence is written;
- in staged mode, `release` equals `staging`.

## Dispatch

### Dispatch a bead

1. **Create the worktree** (orchestrator):
   `tg --no-launch worktree create wt/<slug>`. In staged mode it is based on
   `staging`, which holds every earlier bead. Record its path.
2. **List the fallout** in the worktree
   ([Listing fallout before dispatch](#listing-fallout-before-dispatch)).
   Add the fallout, hub, or wider areas the listing calls for to the bead's
   `Areas:` line, and record each widening in the bead notes.
3. **Use port 5174** for the bead's QA dev server, and 5175 or higher for a
   QA helper. Never use 5173.
4. **Launch the implementation subagent** with the Agent tool, with the
   [brief](#implementation-brief). Record its agent ID in the bead notes.
5. **Wait for it to return.** Launch no other subagent meanwhile. Background
   processes that use no Claude usage (Codex reviews, soaks, tournaments)
   may keep running.

### Implementation brief

Every brief contains, verbatim or by exact path:

- the bead ID, title, description, acceptance criteria, and `Areas:` line;
- whether the bead is core-review ([Reviews](#reviews));
- the phase-page section to read, and the read-first list;
- the worktree path, QA port 5174, and the capture directory
  `/Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>/`
  ([Screenshots](#screenshots));
- whether the bead is `heavy` or `browser` (D17). The orchestrator sizes
  any soak or tournament it runs meanwhile to match;
- these rules:
  - Work only inside the worktree and only within the areas. Run
    `npm install` first.
  - A `fallout:` area covers only the mechanical edits `tsc` forces
    ([Fallout areas](#fallout-areas)). List them after the change, once
    `npm run prepare-workspace` has run:

    ```sh
    for p in tsconfig.json tsconfig.node.json; do npx tsc --noEmit --pretty false -p "$p"; done | grep -oE '^[^ (][^(]*\.[cm]?[jt]sx?' | sort -u
    ```

    A behavioral change outside the other areas stops the subagent.
  - Follow AGENTS.md: UUIDs not names, no images committed, tunables in data
    modules, copy in UI modules, logging, current-state docs, and test rules
    ([D19](decisions.md#d19-test-pruning)).
  - Never run `bd` or `hbd`, `tg candidate`, `tg approve`, `tg cancel`, or
    `tg worktree`. Never push, never create branches, never touch the primary
    checkout except to write browser captures. Run `mkdir -p` on the capture
    directory once, then pass each capture's absolute path as the
    `browser_take_screenshot` `filename`, in the form
    `/Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>/<name>.png`
    ([Screenshots](#screenshots)).
  - Run the [validation ladder](#validation-ladder), plus browser QA when
    runtime behavior or presentation changes. Close the browser context and
    stop the dev server when done.
  - Write the bead's [friction file](#friction-ledger) and any other
    per-bead evidence files.
  - Record pre-existing issues in the bead's own
    `docs/plan/evidence/pre-existing/<bead-id>.md`
    ([Evidence files](#evidence-files)).
  - **Core-review beads only:** for each new state transition, enumerate its
    failure, interrupt, and recovery paths:
    - an error mid-step;
    - a reload or restart mid-operation;
    - a partial write;
    - invalid or stale input;
    - concurrent actors.

    Cover each path with a test that fails when the broken behavior is
    restored, or state why no test applies.
  - Make exactly **one** detailed Conventional Commit, ending with a
    `Bead: <bead-id>` trailer. Leave the worktree clean.
  - If the work exceeds ~1,500 changed non-test lines (mechanical deletions
    may be larger) or needs paths outside the areas, stop and report
    instead. Report the paths and the change each needs.
- **The return format:**
  - commit OID;
  - files changed and the test delta;
  - the fallout files, listed separately from the files in the other areas,
    each with the `fallout:` area that covers it and a one-line description of
    the edit;
  - validation commands with their wall times;
  - QA evidence filenames;
  - the runtime ledger: every process it started, with PID and port, and
    whether it was stopped;
  - rules decisions and card issues created;
  - **core-review beads only:** the failure-path list, with each path's
    test name or the reason no test applies;
  - anything left undone.

### Collect a result

When a subagent returns:

1. **Verify.** The worktree is clean, `HEAD` is the reported OID, the diff
   stays within the areas, and the friction file is present.
   - Every changed file outside the path and hub areas is on the returned
     fallout list, and its diff is mechanical.
   - **For a core-review bead,** check the failure-path list before
     submitting. Every path names a test that exists in the commit, or gives
     a reason no test applies. A missing or thin list goes back to the
     subagent, in the same worktree, before submission.
2. **Submit and approve:**

   ```sh
   tg --no-launch --json candidate <oid>
   tg --no-launch approve <candidate-id>
   ```

   This plan grants promotion authority for in-scope work and in-scope CI
   repairs.
3. **Start the review** in the background if the bead is core-review
   ([Reviews](#reviews)).
4. **Record** the candidate in the bead notes.
5. **Wait for the gate** (D43): run
   `tg --no-launch approve <candidate-id> --wait` as a background command and
   resume when it exits. Then read `tg --no-launch --json status
   <candidate-id>` and handle the outcome below.

### Candidate outcomes

- **Landed:** close the bead (see [Closing](#closing)), then dispatch the
  next ready bead.
- **Failed:** the bead stays the current bead. Dispatch nothing else until
  it lands.
  1. Run `tg diagnose` on it.
  2. Hand the same worktree back to a subagent with the failure, or repair it
     yourself if the fix is small.
  3. Have the commit amended, then submit and approve the replacement.

  Use the `wt` bounded loop: at most one unchanged retry per stated
  hypothesis, then 15 minutes of focused diagnosis, then repair or roll back.
- **Conflicted with the queue prefix:** the subagent rebases the worktree with
  `tg update` and amends, then the orchestrator resubmits.

**Every bead starts from landed code.** Never base a worktree on an
unpromoted commit.

### The orchestrator as implementer

When a phase page says the orchestrator implements a bead (for example Phase
3.2–3.4), it does so in its own worktree, using the same brief rules. No
subagent runs meanwhile.

## Staged validation

[D44](decisions.md#d44-staged-validation) has two modes. Track T bead T9
switches from interim to staged. Before T9 applies the new policy, the
orchestrator lets every in-flight candidate land and holds new submissions.
Candidates submitted after the switch follow staged mode.

### Interim mode

- **The gate** runs `dependencies → trox → review:full` until Phase 2.4b
  removes trox, then `dependencies → review:full`.
- **A bead lands** when it is promoted to `release` and pushed.
- **The orchestrator waits** for each candidate to land before the next
  bead.

### Staged mode

- **The gate stage** (`dependencies`, then `npm run review:gate`) promotes to
  `staging`. New worktrees, and local `master`, follow `staging`.
- **The release stage** (`npm run review:full`, then the fuzz smoke) runs on
  the newest `staging` tip. A pass advances `release` and remote `master`.
- **A bead lands** when it is promoted to `staging`.
- **At every dispatch boundary,** read `tg --no-launch release status`. If
  the latest release run failed:
  1. Diagnose it yourself with `tg diagnose`: the failing steps, the tested
     OID, and the range since the last green `release`.
  2. File a `ci-fix` bead. Its areas are the failing tests plus the files the
     fix will touch, not the whole range.

  It is the next bead dispatched, ahead of all other ready work.
  Tollgate's `max_release_lag = 5` pauses ordinary promotion if the streak
  grows anyway. The `ci-fix` candidate is approved with
  `tg approve --release-fix <id>`, which bypasses that pause (T5).
- **Flaky results** follow [Failure and recovery](#failure-and-recovery).
  Never just retry until green.

## Validation ladder

Run the cheapest relevant check first:

1. **While iterating:** `npm test -- <file>` for focused tests. Use
   `npx vitest run <file> -t '<name>'` for one case.
2. **Before committing:** `npm run review`, the diff-aware lint, typecheck,
   and related tests.
3. **Only when the change touches** test infrastructure, repository-wide
   config, or cross-cutting architecture: `npm run review:full` locally. It is
   heavy (D17). Otherwise the gate or release stage is the aggregate.
4. **Engine beads,** in interim mode, also run the fuzz smoke before
   committing: `npm run fuzz:engine -- --games 200`, introduced in Phase 3.2.
   It is heavy. In staged mode the release stage runs it, and a bead runs it
   locally only when it changes the fuzzer or the step runner.
   - **Phase 5 content batches always run their weighted fuzz** locally
     (batch recipe step 6), in both modes, because it targets the batch's
     own cards. They carry the `heavy` label.
   - **Whichever of Phase 3.2 and T9 lands second** adds the fuzz smoke to
     the release stage of the local Tollgate policy. Both are authorized to
     change the policy for this.
5. **Engine performance claims** (a speedup, a regression's cost, a change
   within budget) compare against a base commit with
   `npm run perf:ab -- <base-oid> [--workload fuzz|bench] [--rounds 5]
   [--args "..."]`. It checks the base out as a detached snapshot outside
   the worktree, runs interleaved A/B rounds of the seeded fuzz or
   `scripts/bench-engine.ts`, records wall time, CPU time, and load per
   round, prints medians and spread, and removes the snapshot. Quote its
   summary, CPU time first on a loaded host, in the bead's measurement file.
   Never rebuild a base by hand: no `git stash` (one `refs/stash` serves
   every worktree), branches, or restored files.

Tests follow AGENTS.md and [D19](decisions.md#d19-test-pruning):

- Never gate on timing, statistics, UI strings, or mutable production data.
- Engine and content tests run in `node`.
- Scenario specs are one file per batch.
- **Delete before you add:** a bead that replaces behavior deletes the tests
  of the replaced behavior in the same commit.

**Budgets are monitored, never asserted.** They live in
`docs/plan/evidence/metrics.md`. A sustained overrun triggers an
[improvement bead](#triggers).

## Reviews

The independent review is a fresh `gpt-5.6-sol` reviewer run through the
Codex CLI. It runs:

- for every bead marked **core-review** on the phase and track pages,
  **asynchronously** ([D18](decisions.md#d18-review-cadence));
- on every phase gate bead, and the Track T gate, covering the whole diff and
  blocking the gate.

Use the binary path, not the shell alias. The alias adds
`--dangerously-bypass-approvals-and-sandbox`. Run it in the background with
stdin closed.

Tollgate removes the bead's worktree when the bead lands, so the review runs
in a **review snapshot**: a detached worktree at the bead's exact commit,
under the orchestrator's scratch directory. It is created with
`git worktree add --detach` (read-only use, like `wt-sequence`'s review
snapshots) and removed when the review returns.

```sh
/Users/dthurn/.local/bin/codex exec -m gpt-5.6-sol -s read-only -C "$SNAPSHOT" \
  -o "$SCRATCH/review-<bead-id>.md" "$(cat <<'EOF'
Independently review the completed change for the request below. Work read-only.
Inspect the diff of <head-oid> against <base-oid> in this repository and read enough
surrounding code to validate each claim. Report only actionable correctness or
architecture issues, brittle tests, missing coverage for changed behavior, or
duplication likely to diverge. For each finding cite file and line, explain the
concrete failure mode, and why it belongs to this change. If none, say so.

Request: <bead title + acceptance criteria + relevant docs/plan page section>
Repository instructions: AGENTS.md, docs/plan/README.md, docs/plan/engine-design.md
EOF
)" < /dev/null
```

The review output lands in the orchestrator's scratch directory, outside
any worktree.

Then follow the `independent-review` skill's steps 3–6:

- **Verify** every finding against the code, at the landed OID.
- **Fix only the confirmed ones,** in a review follow-up bead whose areas
  cover the finding. It preempts other ready work.
- **Record** each disposition (accepted, rejected, or unresolved) in the
  original bead's notes. The original bead may close before its review
  returns. Its follow-up carries the outcome.

For a phase gate, use the phase's first commit's parent as the base. Phases
overlap, so list the phase's commits for the reviewer with
`git log --grep 'Bead: <epic-id>.'` on the `Bead:` trailers, not just a
range.

**When Codex is unavailable** (a usage limit or service error), follow this
procedure:

1. Record `review-debt` in the bead notes, with the base and head OIDs.
2. Continue.
3. Retry once at each later dispatch boundary. When it succeeds, review the
   debt's exact range, and file a follow-up bead for confirmed findings.
4. At a gate, if debt remains and Codex has failed for over 6 hours, run a
   **fallback cold review**:
   - an Agent-tool subagent with the `warden` skill and no inherited context;
   - given the same scope and diff;
   - labelled "fallback (not Sol)" in the notes.

   Never describe a fallback as the independent review.

## Mason passes

Every phase ends with a mason pass, immediately before its gate.

1. **Audit.** Run the Hive `mason` skill read-only, as a subagent.
   - Scope it to the code the phase created or touched, plus the phase page's
     stated focus.
   - Exclude code a later phase deletes or replaces.
   - Include the phase's tests. Over-specified or slow tests are findings.
2. **File.** The audit subagent returns its findings. The orchestrator files
   each one as a bounded bead (label `mason`) with an `Areas:` line. Its edges: after the mason task, before the gate. Never
   chain mason beads to each other unless their areas overlap.
3. **Implement all of them in the phase,** one at a time. Nothing is deferred
   to a later phase or past the run. Each bead preserves behavior and
   rendering. Its evidence is the same as any bead's, plus screenshots for
   touched screens. Engine beads also keep the fuzz smoke green.
4. **Close the mason task** after its audit is recorded in its notes and its
   filed beads have their edges. The gate checks that all of them closed.

A finding too large for one commit is split at filing time. A finding that
would change rules, card behavior, or the player-visible UI is not a mason
refactor; log it in the bead notes and drop it.

## Introspection

**Workflow problems and bad architecture are fixed as soon as the evidence
shows they keep costing time** ([D42](decisions.md#d42-continuous-introspection)).
Three mechanisms make this happen: a friction ledger, standing triggers, and
retrospectives. None of them waits for the phase's mason pass.

### Friction ledger

Every bead writes one file, `docs/plan/evidence/friction/<bead-id>.json`, in
its own commit:

```json
{"bead":"hv-xxx","phase":3,"implementMin":95,"localValidationS":{"review":38,"focused":12,"fuzz":40},"hostLoad":12.4,"testDelta":{"files":-3,"lines":-820,"jsdomFiles":-2},"friction":[{"tag":"lab-solver-override","minutes":25,"note":"setup solver could not place a target for a void-only selector"}]}
```

- **`implementMin`** is the subagent's wall time from dispatch to commit.
- **`hostLoad`** is `sysctl -n vm.loadavg`'s 1-minute value when the
  validation ran. Always read timings next to it.
- **`testDelta`** counts test files, test lines, and `jsdom` test files,
  added minus deleted.
- **`friction`** lists each problem that cost more than ~10 minutes: tooling,
  slow checks, flaky tests, confusing code, a missing primitive or helper,
  an awkward abstraction, a misleading doc. An empty list is fine.
- **`tag`** is a short stable kebab-case slug. Reuse an existing tag for the
  same cause, so that recurrence can be counted. Tags that name one cause in
  different words map to one canonical tag through the `aliases` in
  `docs/plan/evidence/friction-tags.json`.

Gate outcomes (wall time, candidates, CI repairs) come from Tollgate's history
at retrospective time, not from the friction file.
`docs/plan/evidence/friction.jsonl` holds the Phase 1–2 lines written before
the per-bead files existed. Retrospectives read both.

### Triggers

File an **improvement bead** when either of these holds:

- the same friction tag appears in **3 beads** within a phase
  (`triggerBeads` in `docs/plan/evidence/friction-tags.json`);
- a [budget](#validation-ladder) in `metrics.md` is exceeded by **more than
  50% on 3 consecutive beads** at comparable host load.

An improvement bead:

- is filed as soon as the trigger fires, at the next dispatch boundary, and
  preempts the remaining phase tasks (edges first, then `hive_project`);
- carries the label `introspection` and names the evidence: friction files,
  bead IDs, and measurements;
- targets the cause, not the symptom: a faster check, a fixed flaky test, a
  missing primitive, a simpler abstraction, a tooling fix, a test cut, or a
  structural refactor of the code that keeps causing the friction;
- shows before/after numbers for a speed change, and is reverted if the target
  metric does not improve by ≥10%;
- preserves behavior and rendering, like a mason bead. Rules, card behavior,
  and player-visible UI changes are out of scope, and the
  [decisions](decisions.md) stay binding.

A friction cause that is a prerequisite of a running bead is handled as a
prerequisite bead at once, without waiting for a trigger.

The orchestrator runs **`npm run friction:triggers`** at every dispatch
boundary. It reads the friction files and `friction.jsonl`, normalizes tags
through the alias map, and lists every fired tag trigger with its disposition
from the ledger `docs/plan/evidence/introspection.jsonl`. It exits non-zero
when a fired trigger has no disposition. Each fired trigger gets one ledger
line per phase. The improvement bead appends its own line in its commit; the
orchestrator has the next dispatched bead append a `reason` line:

```json
{"tag":"playwright-screenshot-root","phase":2,"bead":"hv-47xj.54"}
{"tag":"worktree-write-hook-misfire","phase":3,"reason":"harness issue: the Write/Edit hook refuses .worktrees paths; no repository fix"}
```

- **`bead`** is the improvement bead filed for the trigger.
- **`reason`** records why no bead is filed, such as a harness issue
  outside the repository or friction that a decision makes by design.

### Retrospectives

Run a retrospective **after every 10th closed bead within a phase** and as part
of every **phase gate**. Run it as a read-only subagent at a dispatch
boundary, before the next bead is dispatched. `npm run friction:triggers`
reports, per phase, the friction files that no recorded retrospective covers
and marks a phase whose count reaches `retrospectiveCadence` (10) as due.

1. Run the Hive `sage` skill read-only, scoped to this project's workflow
   since the last retrospective. Its inputs:
   - the friction files and `friction.jsonl`;
   - `metrics.md`;
   - bead notes;
   - Tollgate history (`tg --no-launch history`), CI repair cycles, and
     release-run failures;
   - review dispositions;
   - fuzz and sweep failures;
   - **waiting time:** time spent waiting on the gate, on usage limits, and
     on prerequisites.
2. Compare the current gate-stage time, release-stage time, `npm run review`
   latency, focused test time, and the D19 suite budgets with their targets.
3. File an improvement bead (label `introspection`) for every recurring cost
   it finds that a trigger has not already covered. Edges first, then
   `hive_project`. Budgets may be revised here, with the reason recorded in
   `metrics.md`.
4. Record the summary and the filed bead IDs in the phase epic's notes.
5. Return a retrospective line for `docs/plan/evidence/introspection.jsonl`
   listing the friction beads it covered, and a disposition line for each
   fired trigger it resolved. The orchestrator has the next dispatched bead
   append them:

   ```json
   {"retrospective":"2026-10-09","phase":2,"bead":"hv-47xj.18","covers":["hv-47xj.1","hv-47xj.2"]}
   ```

At a phase gate, the retrospective runs before the independent review. The gate
closes only after every bead it filed has closed.

## Browser QA

Use the globally configured Playwright MCP service (`http://localhost:8931/mcp`).
If it is unavailable, run `playwright-mcp-service start` and retry. **Never
launch browsers directly.** The project details (scenes, URL parameters,
assert-before-acting) are in the README's Browser QA section.

Subagents may share the orchestrator's MCP connection, and with it one
browser context. Only one subagent runs at a time (D17), so interactive MCP QA
never shares a context. Script-driven tools such as the card sweep and
`scripts/screenshot-runtime.mjs` open their own MCP client, on their own
port.

### Servers and contexts

- Run the QA dev server from the bead's worktree on port 5174:
  `npm run dev -- --port 5174`. Never use 5173.
- Report the server's PID or process group in the return's runtime ledger.
  The orchestrator records it in the bead notes.
- Kill only that PID. Never use `pkill -f vite` or other broad patterns.
- Close the MCP browser context before returning.
- Before each screenshot, assert `location.href` and `window.innerWidth`.
- After each interaction, read `window.__caps`. It must be empty.

### Screenshots

Every capture goes to the gitignored `artifacts/qa/<bead-id>/` of the primary
checkout, outside every Tollgate worktree, so captures survive when Tollgate
removes the bead's worktree. Later beads compare against them. Subagents may
write there even though they otherwise leave the primary checkout alone.
Captures are never committed; reference each by filename only.

The shared Playwright MCP accepts a `filename` only inside its client's first
MCP root, which is the primary checkout for the orchestrator's connection, and
it does not create directories. Create the bead's directory once, then pass
the absolute path straight to `browser_take_screenshot`:

```sh
mkdir -p /Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>
```

```text
browser_take_screenshot filename: /Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>/<name>.png
```

Use that literal absolute form: the MCP does not expand `~`, resolves a
relative `filename` against the primary checkout rather than the worktree, and
refuses paths outside its roots (for example `~/.local/state`). A
script-driven client opened with `connectPlaywrightMcp` from
`scripts/screenshot-runtime.mjs` defaults its root to the process's working
directory, so a script that captures passes `roots` with the primary checkout
first to use the same form.

The default budget per changed surface is one desktop capture (1440×900), one
mobile capture (390×844), and one changed interaction state. Verify each with
`file <path>`.

### Card QA (Phases 4–7)

**Scripted sweep.** `node scripts/qa/card-sweep.mjs --cards <uuids> | --bead
<id> [--port <port>]` drives the Playwright MCP service through
`scripts/screenshot-runtime.mjs`. It is built in Phase 4. For each card and
variant, it:

1. opens `?goto=card-lab&card=<uuid>&variant=<v>`;
2. plays the card through the UI;
3. answers prompts with the first legal choice;
4. passes until the stack is empty.

It flags these failures:

- `__caps` errors;
- a human decision pending with no visible, enabled control;
- the card not reaching its expected zone;
- no `Resolved` engine event;
- no visible board or log change.

Results go to the bead's QA ledger file.

**Judged QA.** Judge cards per [D21](decisions.md#d21-browser-qa-coverage),
with a QA subagent. For each judged card, check all of these on desktop and
mobile:

1. **Playable affordance.** Playability is visible, and unplayable cards look
   disabled.
2. **Prompts.** Prompts name the right thing, with the right count. Optional
   prompts are marked optional. Cancel and back behave correctly.
3. **Targets.** Exactly the legal targets are highlighted and selectable.
4. **Resolution.** The effect is visible on the board (animation, counter,
   status) and appears in the battle log in plain language.
5. **Durations.** "Until end of turn" and similar effects show an indicator
   while active, and the indicator clears on expiry.
6. **Opponent side.** With `&as=enemy`, the AI plays the card and the human can
   follow what happened: reveal dwell, targets shown, log.
7. **Layout.** No clipping or overlap of prompts and controls. `__caps` is
   empty.

**QA ledger.** Write one JSONL line per verdict to
`docs/plan/evidence/qa-ledger/<bead-id>.jsonl`:

```json
{"uuid":"7be2e6d7-abff-4c44-a0c3-35460da1693c","variant":"base","mode":"sweep","verdict":"pass","notes":"","bead":"hv-xxx","commit":"<oid>","screens":[]}
{"uuid":"7be2e6d7-abff-4c44-a0c3-35460da1693c","variant":"amplified","mode":"judged","verdict":"fail","notes":"return marker missing on banished card","bead":"hv-xxx","commit":"<oid>","screens":["windcutter-amp.png"]}
```

`commit` is the base OID the bead was built on. The orchestrator adds the
landed OID in the bead notes. `screens` lists capture filenames in the bead's
[capture directory](#screenshots).

A `fail` must be fixed in the same bead, or in a new bead filed immediately
and dispatched next. Then append a new `pass` line in that bead's file.

## Evidence files

Evidence is written **one file per bead or per entry**, so each bead's
evidence lands in its own commit and is found by bead ID:

| Record | Path |
| --- | --- |
| Friction | `docs/plan/evidence/friction/<bead-id>.json` |
| Measurements | `docs/plan/evidence/measurements/<bead-id>.md` |
| Test triage | `docs/plan/evidence/test-triage/<bead-id>.jsonl` |
| QA ledger | `docs/plan/evidence/qa-ledger/<bead-id>.jsonl` |
| Rules decisions | `docs/plan/evidence/rules-decisions/RD-<bead-id>-<n>.md` |
| Card issues | `docs/plan/evidence/card-issues/<uuid>--<bead-id>.md` |
| Pre-existing issues | `docs/plan/evidence/pre-existing/<bead-id>.md` |

- **Readers aggregate** with `cat`/`jq -s` over the directory.
- **Pre-existing issues.** A bead that finds an issue outside its scope
  writes one Markdown file listing each issue, with its location and a
  one-line description. A bead that finds none writes no file. The first
  bead that records an issue creates `docs/plan/evidence/pre-existing/`.
- **Measurements.** When a page tells a non-gate bead to record numbers or a
  policy text "in `metrics.md`", the bead writes its measurement file
  instead. Each gate bead folds the measurement files since the previous gate
  into `metrics.md`. Only gate beads edit `metrics.md`.
- **Files that exactly one bead writes** are never an area conflict either:
  `content-inventory.json` (5.1), `legacy-behavior.md` (4.7), and each
  tournament report `ai/<run-id>.md`.
- **The introspection ledger**, `introspection.jsonl`, is the one shared
  append-only evidence file: trigger dispositions and retrospective
  coverage ([Triggers](#triggers), [Retrospectives](#retrospectives)).
- **Track T beads** record their friction JSON in their bead notes. T10
  writes those as friction files in one `dreamtides_web` commit.

## Rules ambiguity protocol

Apply the [D10 ladder](decisions.md#d10-rules-ambiguity-ladder). For each
decision:

1. **Amend `docs/rules.md`** with normative, current-state text in the right
   section. Keep its style: symbols, "you control", and so on. Write no
   history. `docs/rules.md` is a single area. A content bead that needs a
   rules change while another bead holds that area records the change in its
   RD file and in its notes. The orchestrator then files a small
   `rules-text` bead that runs next.
2. **Write the RD file** `docs/plan/evidence/rules-decisions/RD-<bead-id>-<n>.md`:

   ```markdown
   # RD-hv-xxx-1: "Until your next turn" durations end at the start of the source controller's next Dreamwell phase
   - Ladder: 4 (MTG analog: "until your next turn" ends as that turn begins)
   - rules.md: § Keywords and Effects → Banish
   - Affects: 7be2e6d7-abff-4c44-a0c3-35460da1693c (amplified), …
   - Why: …
   ```

3. **Encode it once** in the engine. Add a primitive test if the decision
   changes primitive behavior.

The decisions D13–D15 and P1–P6 are written into `docs/rules.md` in Phase 3's
first task.

## Card issues protocol

`docs/plan/evidence/card-issues/<uuid>--<bead-id>.md` holds one card's issue,
as found by one bead:

```markdown
# 0458658d-7e02-4286-9249-93674d16620b
- Problem: text references "Judgment", which the current rules do not define.
- Implemented as: <interpretation> (RD-hv-xxx-1)
- Suggested fix: <wording or number change for the operator>
```

**Never edit the card's data** ([D11](decisions.md#d11-card-data-is-immutable)).
Intentional infinite combos are not issues.

## Logging

New behavior logs through `src/logging.ts`. Development builds write
`logs/journey-log.jsonl`; every build also keeps each game's log in IndexedDB
with a JSONL export ([D40](decisions.md#d40-production-log-capture)). Log
enough to reconstruct what happened.

**The engine stays pure.** It emits engine events and never calls the logger.
The host (the fold adapter, the worker host, the fuzzer, or the tournament
runner) turns events into log lines and adds the game ID and timestamp. The
record schema and the event-to-record mapping are `src/engine/log.ts`; the
fold adapter reports records through its `log` option.

What to log:

- **Engine.** Each applied action with its validated choices, every trigger
  fired and resolved, every prompt opened and answered, every rules-relevant
  RNG draw (stream and purpose), loop detection and shortcuts, and battle end
  with its reason.
- **AI.** Per decision: the policy, budget used, top-k candidates with scores
  and visit counts, the chosen action, and the determinization count. Keep it
  compact: one line per decision.
- **Journey modifiers.** Each dreamsign journey effect applied, with UUID,
  site, and before/after values.
- **Tournaments** log to `logs/tournaments/<run-id>.jsonl`, which is
  gitignored. Summaries go to `docs/plan/evidence/ai/`.
- **Fuzz runs** write no per-game logs. A failing game writes its seed, deck,
  policies, and full action and answer log to
  `logs/fuzz/<run-id>/<game>.jsonl` (gitignored), enough to replay it, and the
  run prints the repro command.

**UUIDs only, no names.** Every log line carries the game ID.

## Resources

These are the [D17](decisions.md#d17-machine-resources) limits:

- `JOURNEY_TEST_WORKERS=2` locally. The local Tollgate policy sets 2.
- One implementation subagent at a time, and one Claude subagent of any
  kind at a time.
- **Heavy commands.** The running bead runs at most one heavy command at a
  time. Tollgate's own validation is the other heavy slot. Track T beads run
  cargo with `CARGO_BUILD_JOBS=4`.
- **Labels.** The orchestrator adds `heavy` or `browser` when a bead's
  acceptance needs heavy validation or interactive browser QA. It decides
  from the bead's text at dispatch if the label is missing.
- **Soaks and tournaments.** Run them in batches of at most 30 minutes, with
  4 worker processes while the running bead is not `heavy` and 2 otherwise.
  They may overlap Tollgate validation and the running bead.
- Watch memory pressure: `memory_pressure`, or `vm_stat` compressed pages.
  Under pressure, finish the running bead and pause soaks and tournaments.
- **Claude usage limits.** When a subagent or the session hits a usage
  limit, wait for the limit to reset, then continue the same bead from its
  worktree ([recovery](#failure-and-recovery)). Never start extra subagents
  to catch up.

## Failure and recovery

- **CI failure.** Follow [candidate outcomes](#candidate-outcomes).
- **Red release run** (staged mode): file a `ci-fix` bead, as described in
  [Staged mode](#staged-mode).
- **Flaky test.** If Tollgate attributes it `flaky-or-non-hermetic`, fix the
  test's hermeticity in a dedicated bead, or delete the test if it fails D19.
  Never retry until green.
- **Codex unavailable.** Handle it as review debt; see [Reviews](#reviews).
- **Playwright MCP unavailable.** Run `playwright-mcp-service start` and retry
  once. If it is still down, continue non-QA work. Record QA debt, and clear it
  before the bead closes, or before the phase gate at the latest.
- **A subagent dies or its result is lost.** Its worktree belongs to the
  orchestrator. Inspect it with `git -C <worktree> status --short` and
  `git log`. Then dispatch a fresh subagent to finish from that state, with
  the original brief plus what is already done.
- **Beads server down.** The Hive store is served by one external Dolt
  `sql-server` on `127.0.0.1:3307`, rooted at `/Users/dthurn/brain/.beads/dolt`.
  It is shared with other Hive projects. When a Beads call fails to connect:
  1. Confirm the server is down, not merely slow: `env
     BEADS_DIR=/Users/dthurn/brain/.beads bd dolt status` fails, and
     `lsof -nP -iTCP:3307 -sTCP:LISTEN` shows no listener.
  2. Restart exactly that server, detached, and nothing else:

     ```sh
     cd /Users/dthurn/brain/.beads/dolt && nohup /Users/dthurn/.local/bin/dolt sql-server -H 127.0.0.1 -P 3307 --loglevel=warning >> /Users/dthurn/brain/.beads/dolt-server.log 2>&1 &
     ```

  3. Verify with `hbd show <current-bead> --json`, and record the restart and
     its PID in the bead notes.
  4. Never restart a server that is still listening, change its port or data
     directory, initialize a store, or run Dolt maintenance. If the restart
     fails, treat Beads as unavailable.
- **Tollgate unavailable.** First check whether it is still starting, or is
  activating repositories: `pgrep -fl tollgate-app`, and after T1a,
  `tg --no-launch doctor`. While it is unavailable:
  1. Let the running subagent finish and commit in its worktree.
  2. Queue its commit for submission, and dispatch nothing else.
  3. Retry with backoff: 1 minute, then 5, then 15.

  Never bypass Tollgate with raw `git push`. Never kill a Tollgate that is
  making progress.
- **Before stopping for any reason,** invoke `justiciar` in the same session
  and follow the Hive executor recovery protocol. That means:
  - repair or relax only agent-imposed constraints, and record the change;
  - never pause for approval: none is required anywhere in this plan;
  - never defer a bead without fresh justiciar agreement.

  A genuine external blocker is one that stays unresolved after recovery, such
  as GitHub being unreachable for hours. For one, checkpoint the affected
  bead in its notes and continue with the next ready bead the blocker does
  not affect.

## Re-entry after compaction or restart

Run this sequence on every resume. It is idempotent.

1. **Read the plan.** Read [README](README.md), then this section. If the
   Phase 7 epic is closed, the run is over: stop.
2. **Find your work.** List your unfinished assignments:
   `hbd list --assignee "${CLAUDE_CODE_SESSION_ID:?}" --status in_progress --json`.
   Normally there is one, plus any bead checkpointed behind a prerequisite.
   If there are several, finish them one at a time, in
   [selection order](#selection-order), before dispatching new work.
3. **For each assignment,** read its notes. The latest note names its
   worktree, subagent agent ID, candidate, and next action.
4. **Check its candidate.** If the notes name one, run
   `tg --no-launch --json status <candidate-id>` and continue from its state.
5. **Check its subagent.**
   - **After a compaction in the same session,** the subagent may still be
     running. Its completion notification still arrives. Never dispatch a
     second subagent while it may be alive. To get its status, send it a
     message by agent ID.
   - **After a session restart,** all subagents are gone.
6. **Check its worktree** when its subagent is gone. If the notes name a
   worktree that this session created, run `git -C <worktree> status --short`
   and `git log -1`.
   - If the worktree holds a finished commit, collect it.
   - Otherwise dispatch a fresh subagent to finish it.

   If the bead was claimed by a different session ID, do not touch its
   worktree. The operator has released the bead; restart it from a fresh
   worktree.
7. **Check outstanding work outside beads:**
   - pending Codex reviews (their snapshot worktrees and output files in the
     scratch directory), and recorded review debt;
   - in staged mode, `tg --no-launch release status`;
   - commits that were queued for submission while Tollgate was unavailable.
8. **Check owned processes.** For each runtime-ledger process in the notes,
   check whether it is alive. Stop it if no running work needs it.
9. **Dispatch the next bead** from the ready queue, reading only the phase
   page of the bead you dispatch.
