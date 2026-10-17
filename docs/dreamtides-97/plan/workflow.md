# Workflow

This page tells each D97 executor session how to do the work. The phase pages
say what the work is. It combines:

- the Hive executor role (`executor`, `bead` and `justiciar` skills in
  `~/hive/skills/`);
- the global `wt` skill (`~/.llms/skills/wt/SKILL.md`);
- this repository's [AGENTS.md](../../../AGENTS.md).

Where they differ, the [decisions](decisions.md) win, then AGENTS.md. This
page is self-contained ([P2](decisions.md#p2-self-contained-plan-docs)).

[Back to the plan](README.md)

## Identity and scope

- **Sessions.** Each D97 executor session is a top-level Claude Code or Codex
  session started in `~/dreamtides_web` and bound to stream `d97`
  ([P1](decisions.md#p1-hive-streams)). The operator starts and stops
  sessions to set capacity; one session is sequential execution.
- **Actor.** A session's actor is its own host ID:
  `"${CLAUDE_CODE_SESSION_ID:?}"` in Claude Code, `"${CODEX_THREAD_ID:?}"` in
  Codex, expanded inside each Beads command.
- **One bead at a time.** A session claims one ready bead, implements it
  itself or through one implementation subagent, and waits for it to land on
  `staging` before claiming the next.
- **Session-only actions.** Only the top-level session calls Beads, the
  Tollgate queue, `tg worktree` or `tg update`, and only for its own beads.
- **Stay in the stream.** Never claim, edit or close a main-plan bead, or
  another project's bead. The exception is a `ci-fix` bead, which either
  stream may own ([Validation](#validation)).
- **Continuous mode is authorized.** It ends when the Phase 6 epic closes.
- **The stream is silent.** Send no push notifications or outbound messages.
  Progress lives in bead notes and session titles.

### Starting, scaling, and draining

- **Start:** launch with the prompt in
  [README § Starting and resuming](README.md#starting-and-resuming-the-stream).
  The session runs `hive executor start --project dreamtides_web --stream d97
  --session <its ID> --continuous`.
- **Wait instead of stopping.** When nothing is ready but other sessions
  hold work that open D97 beads wait on, run
  `/Users/dthurn/hive/bin/hive executor await --session <its ID> --json`
  under Hive's waiting guidance (`~/hive/skills/shared/waiting.md`). Keep the
  default 65-minute wait. Stay silent while nothing changes. Resume on
  `ExecutorWorkReady` or `ExecutorWorkAssigned`. On
  `ExecutorQueueDrained`, stop with kind `drained`.
- **Drain** when told to stop: land the current bead, claim nothing new, run
  `hive executor stop --kind pause`.
- **A session that ends holding a bead** is resumed if its host can resume
  it. If the operator says it will not return, another session releases the
  bead under Hive's abandoned-assignment repair (`~/hive/skills/shared/repair.md`)
  and restarts it from a fresh worktree.

## Beads

Define the routing prefix in every shell command that touches Beads:

```sh
# Claude Code
hbd() { env BEADS_DIR=/Users/dthurn/brain/.beads BEADS_DOLT_AUTO_START=0 BD_NON_INTERACTIVE=1 BD_NO_HOOKS=true bd --sandbox --dolt-auto-commit off --actor "${CLAUDE_CODE_SESSION_ID:?}" "$@"; }
# Codex
hbd() { env BEADS_DIR=/Users/dthurn/brain/.beads BEADS_DOLT_AUTO_START=0 BD_NON_INTERACTIVE=1 BD_NO_HOOKS=true bd --sandbox --dolt-auto-commit off --actor "${CODEX_THREAD_ID:?}" "$@"; }
```

Never initialize a store, start a second server or fall back to another
database. If the configured Dolt server is down, run `justiciar` at once;
never wait it out.

**Every D97 bead carries:**

- metadata `hive_project=dreamtides_web`, `hive_stream=d97` and
  `hive_origin_thread`;
- `--parent` set to its phase epic;
- a description that names its phase-page section and scope, and ends with an
  `Areas:` line;
- acceptance criteria copied from the phase page.

**Labels:**

| Label | Meaning |
| --- | --- |
| `core` | The bead lays down an architectural seam; its review/QA bead reviews the design too |
| `creative` | Writing, character, map or quest design |
| `review-qa` | A review/QA bead ([below](#review-and-qa-beads)) |
| `filing` | Files the next phase |
| `playtest` | Operator feedback |
| `ci-fix` | Repairs a red release run |
| `introspection` | Refactor, tooling or workflow improvement |
| `retrospective` | A phase-end retrospective |
| `gate` | A phase gate |

**Before filing any bead,** search unfinished D97 beads for the same primary
Areas file and the same purpose. Extend the existing bead if you own it;
otherwise record why the new bead is distinct, in its notes.

**Follow-up work gets a new bead** with the right edges, never a reopen.

**A newly found prerequisite of a running bead:**

1. File a new bead with an edge.
2. Make an unvalidated checkpoint commit in the running bead's worktree, and
   record it in the notes.
3. Implement the prerequisite yourself, or leave it ready for another session
   and wait.
4. Rebase the checkpoint with `tg --no-launch update`, finish, and amend into
   the bead's single commit.

### Filing a phase

Filing a phase is a `filing` bead keyed `filing=d97-phase-<n>`, so exactly one
session files it. Its prerequisites are the beads that make the phase's
earliest start reachable soon. The session that claims it:

1. **Refines the phase page.** Revise the page from what landed, what the
   retrospective found, and open `playtest` beads. Fix scope, the task graph,
   acceptance criteria and Areas. Commit that page change as the filing
   bead's own commit, through the normal delivery path. Phases 3–6 start as
   outlines and become full pages here.
2. **Creates the epic** (`--type epic`, the exit gate as acceptance, the
   metadata above).
3. **Creates one child per task** on the refined page. Omit `hive_project`
   for now, and set `intended_project=dreamtides_web` instead, so no session
   selects a child before its edges exist.
4. **Adds the task graph's edges,** then [serialization
   edges](#serialization) against this phase and every unfinished D97 bead.
   Inspect them with `hbd show <id> --json`, and run `hbd dep cycles`.
5. **Admits the children.** Only after the edges are correct, set
   `hive_project=dreamtides_web` on each one.
6. **Adds cross-phase edges** to unfiled beads when the later bead is filed.

### Areas

Each bead's `Areas:` line lists the directories and files it may change. A
change outside them stops the implementer for its session's decision. Areas
identify possible overlap. They are not locks.

Typical D97 areas:

| Area | Path |
| --- | --- |
| D97 rules | `src/rules/d97/` |
| D97 run logic, save, map runtime | `src/d97/` |
| D97 catalogs | `src/content/d97/` |
| Overworld renderer | `src/d97/overworld/`, `src/cumulus/screens/d97/` |
| D97 adapters | `src/screens/cumulus_adapters/d97/` |
| Map tooling | `scripts/d97/` |
| Shared seams | `src/rules/fold-state.ts`, `src/rules/reducer.ts`, `src/rules/events.ts`, `src/session/actions.ts`, `src/eventlog/`, `src/types/identifiers.ts`, `scripts/setup-assets.ts` |

**Shared seams are hub areas.** A bead that changes one lists the seam
explicitly, and the filing session checks for other unfinished beads in both
streams that touch the same seam.

### Serialization

Serialization edges limit costly conflicts. They do not prevent every
conflict.

- **Add an edge** for a real implementation prerequisite, or for
  incompatible changes to the same behavior (two beads redefining the same
  event's semantics, the same save schema version, or the same map's
  anchors).
- **No edge** for a shared filename alone: independent reducer cases, separate
  catalog entries, or new screens beside each other.
- **Record the precise overlap** in both beads' notes when you add an edge.
- **Owners resolve ordinary textual conflicts** with `tg --no-launch update`
  and validate the combined behavior.
- **Across streams:** D97 beads that change shared seams get an edge to an
  unfinished main-plan bead only for incompatible behavior. The D97 session
  adds the edge from its own bead. It never edits the main-plan bead.

### Selection order

Claim only from the session's fresh stream-aware ready list (the command
Phase 0 adds to Hive; [P1](decisions.md#p1-hive-streams)). Never claim by ID
around the list: claiming by ID bypasses peer serialization edges.

Among ready beads, take them in this order:

1. `ci-fix`.
2. `playtest`.
3. `introspection` beads filed by a trigger, and review follow-ups.
4. `review-qa`.
5. `filing`.
6. Everything else, by priority, then by age.

## Delivery

For each claimed bead:

1. **Read the bead** and its phase-page section. Record the plan and Areas in
   the notes.
2. **Create a worktree** with `tg --no-launch worktree create wt/<bead-id>`,
   which bases it on `staging`. Run `npm install` in it.
3. **Implement** in that worktree, yourself or through one implementation
   subagent. A subagent works only in the given worktree and Areas, makes
   exactly one commit, and never runs `bd`, `tg candidate`, `tg approve`,
   `tg update` or `tg worktree`.
4. **Validate** ([Validation ladder](#validation-ladder)) and run the QA the
   bead calls for.
5. **Commit once,** as a detailed Conventional Commit whose trailer names the
   bead (`Bead: <id>`).
6. **Submit** with `tg --no-launch --json candidate HEAD`, then authorize
   with `tg --no-launch approve <candidate-id> --wait` as a background
   command. This plan grants promotion authority for in-scope D97 work and
   in-scope CI repairs.
7. **Repair** a failing candidate in the same worktree, and resubmit.
8. **Close** after the candidate lands on `staging`, with
   `hive_resolution=completed` and close notes that include the friction lines
   ([Introspection](#introspection)).

**Updating a worktree.** When another bead lands first and conflicts, run
`tg --no-launch update` in your own worktree. Resolve the conflicts, revalidate
the combined behavior, and resubmit.

## Validation

### Validation ladder

1. **While iterating:** `npm test -- <file>`.
2. **Before committing:** `npm run review` and `npm run knip`. Delete
   whatever exports and files your change leaves unused.
3. **Map and dialogue beads:** also run `npm run d97:map -- validate <map>`
   and `npm run d97:dialogue -- validate`, once Phase 1 has added them.
4. **Save-schema beads:** also run the golden-fixture load tests
   ([P5](decisions.md#p5-saves-are-versioned-snapshots)).
5. **`npm run review:full`** only for changes to test infrastructure,
   repository-wide configuration or cross-cutting architecture. Otherwise
   the release stage runs it.

### Staged validation and ci-fix

- **The gate stage** (`dependencies`, `npm run review:gate`) runs on every
  candidate in about 60 s and promotes to `staging`. **A bead lands when it
  reaches `staging`.**
- **The release stage** (`review:full` plus the fuzz smoke) runs
  asynchronously on the newest `staging` tip.
- **At every dispatch boundary,** read `tg --no-launch release status`. If
  the latest release run failed:
  1. Search project `dreamtides_web` (both streams) for an unfinished `ci-fix`
     bead keyed `release_step=<step>`. If one exists, append the run's ID to
     its notes and continue.
  2. Otherwise diagnose with `tg diagnose`, and file a `ci-fix` bead with that
     key in this stream. Its Areas are the failing tests plus the files the
     fix touches.
  3. Claim it next, ahead of all other work. Approve its candidate with
     `tg approve --release-fix <id>`, which bypasses the lag pause.
- **Flaky results** are diagnosed, never retried until green.
- **Budgets are watched, never asserted.** A D97 bead that pushes the gate
  stage past 60 s files an `introspection` bead at once.

## Review and QA beads

From Phase 2 on, every code bead that changes behavior has a **review/QA
bead** (label `review-qa`). It depends on its implementation bead and is
claimed after the implementation lands. Before M1, one combined bead
([1.16](phase-1-first-dream.md#116-m1-review-and-qa)) plays this role
for the whole milestone ([P9](decisions.md#p9-process-light-until-m1)).

Creative beads get a batched review/QA bead per two or three dreams. Pure
documentation and data-only beads get none. Their acceptance checks are
enough.

A review/QA bead:

1. **Prepares the review inputs.** It works in a fresh worktree on `staging`,
   and also makes a detached review snapshot at the reviewed bead's landed
   OID. It writes an immutable scope packet to scratch: base and head OIDs,
   the changed paths, the bead's acceptance criteria, and the decisions and
   design sections that apply.
2. **Runs a cold review.** This is a fresh, read-only Codex reviewer using
   the `warden` skill, with no prior context:
   - a Codex session spawns a subagent with `fork_turns: "none"`;
   - a Claude Code session runs
     `command codex exec -s read-only -C <snapshot> -o <output> "$(cat <prompt>)" < /dev/null`.

   The prompt names the snapshot, the base and head OIDs, the scope packet,
   the bead's request and acceptance, `AGENTS.md`, this plan's README and
   decisions, and the invariants and checks. The reviewer reports its scope
   coverage before its findings. If no Codex reviewer is available, record
   `review-debt` with the OIDs and packet, add the label, and retry at each
   dispatch boundary. A phase gate waits for its review debt.
3. **Runs manual QA** of the changed player workflow in the browser
   ([Browser QA](#browser-qa)), asserting state and geometry, with
   `window.__caps` empty.
4. **Verifies every finding** against the code at `staging`. It fixes the
   confirmed ones within its own Areas, which are the reviewed bead's Areas.
5. **Commits once** (fixes plus any pre-existing-issue file), or closes with
   no commit when nothing is confirmed.
6. **Records** each finding's disposition (accepted, rejected or unresolved)
   in its close notes. A finding too large to fix here files its own bead,
   which preempts other work.

A `core` bead's review also judges its seam's design: whether the abstraction
will hold for the later phases that build on it.

## Creative beads

Creative beads follow [P16–P20](decisions.md#writing). Each one:

- reads the story bible (from Phase 2), the dream's brief, and the design
  sections for the anchor kinds and quest kinds it uses;
- keeps every name, line and description in content modules, and every
  identity a UUID;
- runs the map loop for maps: edit the recipe, then `validate`, then
  `preview`, then read the PNGs back and fix what reads badly (a cramped
  plaza, a road to nowhere, a door hidden behind a house, an empty quarter),
  repeating until clean;
- runs the dialogue validator, then reads each tree aloud in order, checking
  voice, length, and that every choice leads somewhere;
- plays its own dream in the browser once before committing (by teleport,
  then on foot over the main route).

A dream's QA bead reviews the writing against the story bible:

- voice;
- consistency with recurring characters;
- that no tileset name or dream name appears
  ([P10](decisions.md#p10-dreams-are-unnamed)).

It also plays each dream on foot.

## Browser QA

- **Playwright.** Use the globally configured Playwright MCP service
  (`http://localhost:8931/mcp`). If it is unavailable, run
  `playwright-mcp-service start` and retry. Never launch a browser directly.
- **Servers.** Run your own dev server on a free port of 5174 or higher, never
  5173. Kill only your own server's process tree.
- **Assertions.** Assert through the DOM, the React overlay and
  `window.__d97` ([P26](decisions.md#p26-qa-surface)), with `window.__caps`
  empty at the end.
- **Screenshots.** Captures go to the primary checkout's gitignored
  `/Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>/` and are referenced
  by filename only. Never commit them.
- **Visual changes** add one desktop capture, one mobile capture and one
  changed interaction state. New screens and renderer work add a wider matrix
  and one cold visual review with the `visual-review` skill.

## Introspection

From Phase 2 on, following [P30](decisions.md#p30-phase-end-introspection):

- **Friction lines.** Each bead's close notes end with a block like this:

  ```text
  Friction:
  - map-preview-scale (25m): preview PNG too small to read anchors at 150×150
  - gate-time (10m): related tests ran the whole suite for a catalog edit
  Implement: 95m. Validation: review 38s, focused 12s.
  ```

  Tags are short kebab-case slugs. Reuse a tag for the same cause.
- **Trigger.** At each dispatch boundary, check the phase's close notes. A tag
  that appears in three beads files an `introspection` bead keyed
  `trigger=<tag>/d97-phase-<n>`, unless one exists. It targets the cause,
  preserves behavior and preempts phase work.
- **Phase-end beads** run the refactor-and-tooling pass (`mason`) and the
  retrospective (`sage`, read-only). Both file bounded beads that land within
  the phase.

## Playtest beads

The operator plays milestone builds when they choose
([P8](decisions.md#p8-milestones-never-pause-the-stream)). Their feedback
becomes `playtest` beads. A session that receives feedback in chat files it
verbatim, with the build's `staging` OID.

A playtest bead may:

- fix the issue;
- amend a phase page and file follow-up beads;
- record a decision change, as a new P-decision entry, only when the operator
  stated it.

## Evidence files

- **Pre-existing issues** go in `evidence/pre-existing/<bead-id>.md`, in the
  bead's own commit.
- **Dream briefs** go in `evidence/dreams/<dream-uuid>.md`.
- **Retrospectives** go in `evidence/retrospectives/<bead-id>.md`.
- **Calibration** reports go in `evidence/calibration/<bead-id>.md`.

All paths are relative to `docs/dreamtides-97/plan/`.

## Logging

Every D97 system logs per Appendix B §B17, with UUIDs and never names.

- **Development:** `logs/journey-log.jsonl`.
- **Every build:** per-game IndexedDB storage with JSONL export.

Reconciliations and migrations on load are logged too
([P5](decisions.md#p5-saves-are-versioned-snapshots)). Read the logs first
when debugging a playtest report.

## Failure and recovery

- **A blocked Hive, Beads or Tollgate operation** (Dolt down, a stuck queue, a
  Tollgate restart) gets `justiciar` at once, not a timed wait.
- **A Hive or Tollgate defect** that blocks the stream is fixed at its cause
  as its own bead in that repository
  ([P22](decisions.md#p22-other-repositories)).
- **Usage limits.** Wait for the reset and continue the bead, or drain.
  Never start extra subagents to catch up.

## Re-entry

After compaction, resume or restart:

1. Read [README](README.md), then this page.
2. List your own claimed D97 beads, with
   `hbd list --assignee <your ID> --status in_progress --json`, filtered to
   `hive_stream=d97`.
3. For each one, read its notes for the worktree, the candidate and the next
   action. Check the candidate with `tg --no-launch status`. Continue the
   bead, one at a time in selection order.
4. With nothing claimed, check `tg --no-launch release status`, then select
   from the ready list.
