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

Bead 1.18 refines this page before filing it, using M1's friction, the 1.16
review findings, and any `playtest` beads already filed.

[Back to the plan](README.md)

## Earliest start and task graph

The phase starts when 1.16 lands. Phase 2 tasks run beside the open
`playtest` beads.

- 2.1, 2.2, 2.3 and 2.4 start at once.
- 2.5 ← 2.3 (rooms reuse the hardened map tooling)
- 2.6 ← 2.4
- 2.7 ← every bead 2.2 files, plus 2.3 and 2.5
- 2.8 ← 2.7
- 2.9 ← 2.2 and 2.4 (Phase 3's earliest start)
- 2.10 ← 2.6, 2.7, 2.8, 2.9 and every review/QA bead of the phase

Paired review/QA beads: 2.3 and 2.5 each get one. The mason beads filed by
2.2 get one each when they change behavior.

## Tasks

### 2.1 Design docs alignment

Update `docs/dreamtides-97/README.md`, Appendices A–E and the visual guide to
the decisions and to what M1 built:

- unnamed dreams, with thumbnail door labels, Atlas nodes and sage hints
  ([P10](decisions.md#p10-dreams-are-unnamed));
- Tiled-first maps and recipes (P11–P12);
- map sizes and walking speed (P13);
- controls (P14);
- runtime sprite layering (P15);
- rooms (P19);
- townsfolk (P20);
- versioned saves, which replace content-hash pinning (P5).

**Acceptance:** the documents describe the current system, without "no
longer" phrasing.

### 2.2 Refactor and tooling pass over M1

Run the `mason` audit over everything Phase 1 created or touched, together
with the M1 friction and the 1.16 findings. File bounded refactoring and
tooling beads, each with Areas, acceptance and edges. Every bead it files
lands in this phase.

The audit focuses on:

- seams Phase 3 will lean on (the run state shape, the interaction registry,
  the battle host, the dialogue effects);
- duplicated journey logic that should be a mode-neutral core
  ([P6](decisions.md#p6-shared-code-without-journey-changes));
- test cost at the gate.

### 2.3 Map tooling hardening

From 1.14's friction:

- **Grow the stamp catalog** across the asset library: building, nature,
  dungeon, desert, winter, Japanese, sci-fi, graveyard and street stamps,
  each with a preview sheet.
- **Auto-tiling brushes** for each terrain family.
- **A reseason operation** for LPC Revised terrain.
- **A "compose new map" path** for themes with no source map.
- **Inspector improvements** as the agents asked for them.

**Acceptance:**

- A test map built only from stamps and brushes passes the validator.
- Every new operation has a synthetic-fixture test.

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

### 2.5 Rooms (core)

Implement [P19](decisions.md#p19-rooms-after-m1):

- room map modules with building-door anchors;
- the transition (a fade, with no veil);
- rooms that share their dream's waypoint and tier;
- anchors inside rooms;
- reload placement at a room's door;
- validator rules for room reachability.

Add one room to the first dream (its shop or a quest giver's house), built
from a Source of Tales interior.

**Acceptance:**

- `node` tests cover room transitions in state.
- Browser QA enters and leaves the room, and reloads inside it.

### 2.6 First dream revision (creative)

Revise the first dream's residents and quests against the story bible, and
add the through-line hooks it calls for.

### 2.7 Retrospective

Run the read-only `sage` pass described in
[P30](decisions.md#p30-phase-end-introspection), covering Phases 1 and 2.
File improvement beads, which land within the phase. Write
`evidence/retrospectives/<bead-id>.md`.

### 2.8 Gate review

A review/QA bead: a cold `warden` review of the whole Phase 2 diff. Confirmed findings get
follow-up beads that land within the phase.

### 2.9 File Phase 3

Refine [Phase 3](phase-3-act-one.md) from its outline into a full page, then
file it.

### 2.10 Phase 2 gate

1. Confirm `release` contains every Phase 2 commit.
2. Check that the M1 golden save still loads.
3. Record the build's OID in the epic notes.
4. Close the epic.

## Exit gate

- The documents are aligned.
- The story bible has landed.
- The tooling is hardened.
- Rooms work.
- Every mason and retrospective bead has landed.
- The gate review is resolved.
- Phase 3 is filed.
