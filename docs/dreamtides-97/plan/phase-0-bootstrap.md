# Phase 0: Bootstrap

**Goal:** make a stream-scoped D97 executor possible, record both plans in
the shared docs, and file Phase 1. The planning session runs this phase
itself after the operator approves the plan
([P3](decisions.md#p3-bootstrap-by-the-planning-session)). No D97 executor
starts before it ends.

[Back to the plan](README.md)

## Order

- 0.1 first.
- 0.2 and 0.3 after 0.1 is installed.
- 0.4 files Phase 1 unadmitted at any point, and admits it only after 0.2 and
  0.3.

## Tasks

### 0.1 Hive streams

Implement [P1](decisions.md#p1-hive-streams) in `~/hive`, as a bead of Hive's
own project under Hive's AGENTS.md. Promotion authority comes from
[P22](decisions.md#p22-other-repositories).

- **Start binding.** `hive executor start` accepts `--stream <name>`. The
  state file stores it, and a later start with a different stream is
  refused, as a different project already is.
- **Membership.** A bead belongs to stream `s` when its metadata has
  `hive_stream=s`. A bead without `hive_stream` belongs to the default stream.
- **Queue reads.** The `ready` and waiting reads filter by the session's
  stream. The **held** read stays project-wide, so a blocker held in the other
  stream keeps a wait alive.
- **Agent selection.** A stream-aware ready command, such as
  `hive executor ready --session <id> --json`, returns exactly what `await`
  would wake on.
- **Hooks.** The stop hook and `await` pass the stored stream through.
- **Skills.** The executor skill's selection step uses the new command.
  Update the shared waiting guidance if it changes.
- **Tests** cover: default-stream exclusion of streamed beads, stream-only
  selection, project-wide held counting, and refused rebinding.

**Acceptance:**

- Hive's own validation passes.
- The feature is installed.
- A dry run in a scratch Beads database shows a `--stream d97` session seeing
  only `hive_stream=d97` beads, and a default session seeing none of them.
- Record the exact selection command in
  [workflow § Selection order](workflow.md#selection-order).

### 0.2 Reload main-plan sessions

Main-plan executor sessions loaded the executor skill before streams
existed. Until they reload it, they could claim a D97 bead. Ask the operator
to restart, or tell to re-read the executor skill, each running main-plan
session at its next bead boundary. Wait for the operator's confirmation
before 0.4 admits anything.

### 0.3 Shared documents

One commit in this repository, through `wt`:

- **`AGENTS.md`.** The Plan section names both plans:
  - the main plan, in the default stream;
  - D97, in stream `d97`, with `docs/dreamtides-97/plan/` as its README,
    decisions and workflow.

  It states that a session follows the plan of its stream, and that D97
  sessions write pre-existing issues to D97's evidence path.
- **The main plan's D33.** Add an exception that keeps `docs/dreamtides-97/`
  tracked through the main plan's documentation end state.
- **The main plan's workflow.** Two notes:
  - its sessions run in the default stream;
  - its `ci-fix` duty search covers both streams
    ([P24](decisions.md#p24-validation-shared-with-the-main-plan)).

### 0.4 File Phase 1

File the [Phase 1](phase-1-first-dream.md) epic and children, following
[workflow § Filing a phase](workflow.md#filing-a-phase):

- every bead gets `hive_stream=d97`;
- add the task graph's edges and the serialization notes;
- admit the children only after 0.2 and 0.3.

Then give the operator the launch prompt from
[README § Starting and resuming](README.md#starting-and-resuming-the-stream).

## Exit gate

- Hive streams are installed and verified.
- The shared documents have landed on `staging`.
- Phase 1 is filed and admitted.
- No main-plan session runs the pre-stream skill.
