# Phase 2: Consolidation

**Goal:** turn the M1 sprint into a foundation the rest of the campaign can
stand on:

- the design documents agree with what was built;
- the story bible exists;
- the map tooling is ready for dozens of dreams in many themes;
- dreams can own rooms;
- the M1 code is refactored where its shortcuts would compound.

The full process starts here
([P9](decisions.md#p9-process-light-until-m1)): paired review/QA beads,
friction lines in close notes, and phase-end introspection
([P30](decisions.md#p30-phase-end-introspection)).

Bead 1.18 refined this page from M1's friction lines and the pre-existing
issues Phase 1 recorded (`evidence/pre-existing/`). No `playtest` beads were
open, and 1.16's review had not yet run, so its findings reach Phase 2
through 2.2, which waits for it.

[Back to the plan](README.md)

## What M1 left for this phase

Phase 1's friction lines and evidence files name these:

- **Shared seams churn.** Every D97 subsystem adds its cases to the same
  files: `src/rules/d97/d97-state.ts`, `src/rules/reducer.ts`,
  `src/rules/events.ts`, `src/session/actions.ts` and the overworld adapter.
  Parallel beads conflicted there on almost every landing
  (`rebase-shared-seams`, three beads), and the overworld adapter is well past
  the Cumulus 120-line adapter limit.
- **Plan gaps.** No Phase 1 task loaded an authored dream into a run
  (`plan-gap-dream-loading`; repaired by an unplanned bead), and P12 names a
  door spacing without a value (`spec-gap-door-spacing`).
- **Design points the slice settled by reading.**
  - Head starts: S32 says none; Appendix A §A18 and §B10 add one. M1 uses the
    tier knob alone.
  - The start dream's waypoint: §B6 makes it active from the start. M1 keeps
    it dormant until touched.
  - Reload placement after a battle: M1 returns the player beside the
    battle's anchor until the next door or waypoint use. §B17 reads as the
    last door or waypoint.
  - A shop "visit" ends when the player leaves the dream, so the one-dream
    slice allows one restock per run.
  - Ante drift compared rarity cost until sale quotes existed.
- **Runtime gaps.** Hidden quest objects still block movement; development
  fixtures register in every build; the first dream's arrival sits under the
  control bar; its automapping `ruleset` tileset never links; ULPC idle sheets
  lack props and the child body.
- **QA tooling.** Scenarios run without Node APIs, the dev server reloads the
  page when a scenario's checkout changes, one MCP call caps at five minutes,
  and a lost final call can retain browser slots (`qa-transport-loss`).

## Earliest start and task graph

The phase starts when 1.16 lands: 2.1, 2.2, 2.3 and 2.4 wait for it, so its
fixes, the frozen v1 save schema and the M1 milestone fixture are in place.
Phase 2 tasks run beside any open `playtest` beads.

- 2.1, 2.2, 2.3 and 2.4 start once 1.16 lands.
- 2.3a ← 2.3 (review/QA)
- 2.5 ← 2.3 (rooms reuse the hardened map tooling)
- 2.5a ← 2.5 (review/QA)
- 2.6 ← 2.4 and 2.5 (the room it adds is in the first dream)
- 2.7 ← every bead 2.2 files, plus 2.3 and 2.5
- 2.8 ← 2.7
- 2.9 ← 2.2 and 2.4 (Phase 3's earliest start)
- 2.10 ← 2.6, 2.7, 2.8, 2.9 and every review/QA bead of the phase

Paired review/QA beads: 2.3a and 2.5a. The mason beads filed by 2.2 get one
each when they change behavior.

**Serialization.** 2.1 and 2.4 change only documents. 2.3 changes the map
tooling (`scripts/d97/`, `src/d97/map/`, the stamp catalog). 2.5 changes the
map runtime, the D97 rules and save, and the shared seams; it waits for 2.3,
and 2.2's seam refactors are filed with edges against it. 2.6 changes the
first dream's content, after 2.5 adds its room.

## Tasks

### 2.1 Design docs alignment

Update `docs/dreamtides-97/README.md`, Appendices A–E and the visual guide to
the decisions and to what M1 built:

- unnamed dreams, with thumbnail door labels, Atlas nodes and sage hints
  ([P10](decisions.md#p10-dreams-are-unnamed));
- Tiled-first maps and recipes (P11–P12), including a value for door spacing;
- map sizes and walking speed (P13);
- controls (P14);
- runtime sprite layering (P15), with palette recolor at load;
- rooms (P19);
- townsfolk (P20);
- versioned saves, which replace content-hash pinning (P5);
- dream modules, which hold each dream's topology and residents;
- each design point the slice settled by reading (see
  [What M1 left](#what-m1-left-for-this-phase)): settle it in the documents,
  and file a bead for any code change the settled rule needs.

**Acceptance:**

- The documents describe the current system, without "no longer" phrasing.
- Each settled design point names its rule in the documents, and any code
  change it needs has its own bead.

Areas: `docs/dreamtides-97/README.md`, `docs/dreamtides-97/appendix-*.md`,
`docs/dreamtides-97/overworld-visual-guide.md`

### 2.2 Refactor and tooling pass over M1

Run the `mason` audit over everything Phase 1 created or touched, together
with the M1 friction above and the 1.16 findings. File bounded refactoring and
tooling beads, each with Areas, acceptance and edges. Every bead it files
lands in this phase.

The audit focuses on:

- seams Phase 3 will lean on (the run state shape, the interaction registry,
  the battle host, the dialogue effects, the dream modules);
- the shared-seam churn: let each D97 subsystem register its events, cases
  and actions beside its own code, so parallel beads stop colliding in the
  reducer, the event registry, the actions facade and the overworld adapter;
- duplicated journey logic that should be a mode-neutral core
  ([P6](decisions.md#p6-shared-code-without-journey-changes));
- the runtime gaps above;
- the QA tooling gaps above;
- test cost at the gate.

**Acceptance:**

- The audit's findings are in `evidence/mason/<bead-id>.md`.
- Every bead it files has Areas, acceptance, edges and a review/QA bead when
  it changes behavior.

Areas: `docs/dreamtides-97/plan/evidence/mason/`

### 2.3 Map tooling hardening

From 1.14's friction:

- **Grow the stamp catalog** across the asset library: building, nature,
  dungeon, desert, winter, Japanese, sci-fi, graveyard and street stamps,
  each with a preview sheet.
- **Auto-tiling brushes** for each terrain family.
- **A reseason operation** for LPC Revised terrain.
- **A "compose new map" path** for themes with no source map.
- **Inspector improvements** as the agents asked for them.
- **Link or drop unused tilesets,** so a compiled map never references art
  that workspace preparation does not serve.

**Acceptance:**

- A test map built only from stamps and brushes passes the validator.
- Every new operation has a synthetic-fixture test.

Areas: `scripts/d97/`, `src/d97/map/`, `src/content/d97/stamps/`,
`src/content/d97/map-tuning.ts`, `scripts/setup-assets.ts`, `README.md` (D97
tooling section)

### 2.3a Review and QA: map tooling

A review/QA bead for 2.3 ([Review and QA beads](workflow.md#review-and-qa-beads)).

### 2.4 Story bible (creative)

Write `docs/dreamtides-97/story-bible.md` ([P16](decisions.md#p16-narrative)):

- the premise of the dreaming world and the player's place in it;
- tone and register;
- voice guides for the ten Dream Guides (keeping their authored journey
  lines), the ten incarnations and Apollyon;
- how recurring characters react to act progress and earlier meetings;
- naming rules for characters and items;
- recurring motifs;
- what never appears (dream names, tide names).

**Acceptance:**

- Its review/QA bead does a cold read for internal consistency.
- No contradiction with the design overview.

Areas: `docs/dreamtides-97/story-bible.md`

### 2.5 Rooms (core)

Implement [P19](decisions.md#p19-rooms-after-m1):

- room map modules with building-door anchors;
- the transition (a fade, with no veil);
- rooms that share their dream's waypoint and tier;
- anchors inside rooms;
- reload placement at a room's door, extending the run's last-place record;
- validator rules for room reachability;
- save reconciliation for anchors inside rooms.

Add one room to the first dream (its shop or a quest giver's house), built
from a Source of Tales interior.

Any change to the persisted snapshot ships a migration from schema v1 and
keeps the frozen v1 fixture loading
([P5](decisions.md#p5-saves-are-versioned-snapshots)).

**Acceptance:**

- `node` tests cover room transitions in state.
- The v1 golden fixture and the M1 milestone fixture still load.
- Browser QA enters and leaves the room, and reloads inside it.

Areas: `src/d97/map/`, `src/d97/overworld/`, `src/d97/save/`,
`src/rules/d97/`, `src/content/d97/dreams/`, `src/content/d97/maps/`,
`src/screens/cumulus_adapters/d97/`, `src/cumulus/screens/d97/`, and the
shared seams `src/rules/events.ts`, `src/rules/reducer.ts` and
`src/session/actions.ts`

### 2.5a Review and QA: rooms

A review/QA bead for 2.5, which also judges the room seam's design for the
later phases.

### 2.6 First dream revision (creative)

Revise the first dream's residents and quests against the story bible, and
add the through-line hooks it calls for, including the room's residents.

**Acceptance:**

- The dialogue and map validators are clean.
- The writing follows the story bible, with no dream or tileset name.
- The bead plays the dream once in the browser before committing.

Areas: `src/content/d97/dreams/`, `src/content/d97/dialogue/`,
`src/content/d97/quests.ts`, `src/content/d97/maps/`

### 2.7 Retrospective

Run the read-only `sage` pass described in
[P30](decisions.md#p30-phase-end-introspection), covering Phases 1 and 2.
File improvement beads, which land within the phase. Write
`evidence/retrospectives/<bead-id>.md`.

Areas: `docs/dreamtides-97/plan/evidence/retrospectives/`

### 2.8 Gate review

A review/QA bead: a cold `warden` review of the whole Phase 2 diff. Confirmed
findings get follow-up beads that land within the phase.

Areas: the Areas of Phase 2's beads (fixes only)

### 2.9 File Phase 3

Refine [Phase 3](phase-3-act-one.md) from its outline into a full page, then
file it.

Areas: `docs/dreamtides-97/plan/phase-3-act-one.md`

### 2.10 Phase 2 gate

1. Confirm `release` contains every Phase 2 commit.
2. Check that the M1 milestone fixture still loads.
3. Record the build's OID in the epic notes.
4. Close the epic.

Areas: none (bead and epic notes only)

## Exit gate

- The documents are aligned.
- The story bible has landed.
- The tooling is hardened.
- Rooms work, and the M1 save still loads.
- Every mason and retrospective bead has landed.
- The gate review is resolved.
- Phase 3 is filed.
