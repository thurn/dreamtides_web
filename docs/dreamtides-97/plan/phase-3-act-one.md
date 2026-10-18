# Phase 3: Act 1 (M2)

**Goal:** a full assembled Act 1, played from Avatar select to the Act 1
incarnation and through its exit door. That means:

- about 8 compact catalog dreams across at least three tileset categories,
  joined by blind doors, each opening on a town
  ([P13](decisions.md#p13-map-sizes-and-walking-speed),
  [P33](decisions.md#p33-towns-and-walkable-paths));
- waypoints and fast travel;
- the Dream Atlas;
- Dream Guide services, sages, chests and prize duels;
- amulets and their merchants;
- Dreamsign slots;
- the incarnation guarding the act.

Bead 2.9 refined this page from its outline, using what Phases 1 and 2
built: the dream modules, the hardened map tooling (stamps, brushes,
reseason, compose), the story bible, and the open questions it lists.

[Back to the plan](README.md)

## Earliest start and task graph

The phase builds on Phase 2's seam work. Every system bead waits for these
2.2 mason beads, which reshape the code the systems extend:

- run-dream scoping and production-free development fixtures;
- the frozen save type (Phase 3 changes the snapshot shape, so it ships
  migration v1→v2);
- per-subsystem event specs;
- the D97 phase union;
- the pure interaction resolver.

Content beads wait for 2.3 (map tooling) and 2.4 (story bible), which have
landed, and for 3.1.

- The M1 playtest beads come first ([Playtest
  revisions](#playtest-revisions)). PT.1 ← the plan revision. PT.2 and
  PT.1a ← PT.1. PT.2a ← PT.2. PT.3 ← the plan revision.
- 3.1 ← rooms (2.5), the resident incarnations bead (2.2), 2.6, and PT.2.
- 3.2 (assembly) ← 3.1.
- 3.3 (doors), 3.4 (waypoints), 3.7 (Dream Guides), 3.10 (sages),
  3.11 (chests and prize duels), 3.13 (incarnation), 3.14 (quests v1) ← 3.2.
- 3.5 (Atlas) ← 3.3 and 3.4. 3.10 ← 3.5 too (hints mark the Atlas).
- 3.6 (curated pools) ← the acquisition bead from 2.2.
- 3.8 (resonance cores and amulets) ← 3.2 and 3.6.
- 3.9 (guide services) ← 3.7.
- 3.12 (Dreamsign slots) ← 3.14.
- 3.15 (Takeshi's trials) ← 3.7 and 3.14.
- 3.16 (dialogue conditions) ← 3.2. 3.17 (credits) starts at once.
- 3.18 (art sourcing) starts at once.
- Each dream's map bead ← 3.1, 3.18 and PT.1. Each residents bead ← its map
  bead, 3.14 and 3.16.
- 3.20 (through-line dialogue) ← 3.7, 3.13 and 3.16.
- Every system bead has a paired review/QA bead. Dreams get batched QA
  beads, one per two or three dreams.
- 3.21 (mason) ← every system and content bead. 3.22 (retrospective)
  ← 3.21's filed beads. 3.23 (gate review) ← 3.22. 3.24 (file Phase 4)
  ← 3.2 and 3.20. 3.25 (gate) ← every bead of the phase.

**Serialization.** Assembly (3.2) owns the act topology in run state; doors,
waypoints, guides, sages, chests and quests read it and add their own state.
Each system adds its own events through the event specs, so shared-seam
conflicts are ordinary. The snapshot changes in 3.2 first; every later
system that changes it extends the same v2 schema before Phase 3's gate
freezes it, or adds the next migration once it is frozen.

## Tasks

### Playtest revisions

The operator's M1 playtest set compact dreams, wide paths and a starting town
in every dream ([P13](decisions.md#p13-map-sizes-and-walking-speed),
[P33](decisions.md#p33-towns-and-walkable-paths)). These `playtest` beads
preempt other ready work.

#### PT.1 Map tooling for compact dreams, wide paths and towns (core)

`hv-j1n2.66`. It moves `map-tuning.ts` onto the compact size classes and
reach maxima, and adds the town radius, path widths and detour ratio as
tunables.

- **The validator** checks the town radius, path widths (with explicit
  narrow-crossing exemptions), the detour ratio and reach.
- **The inspector** reports reach times and narrow passages, and draws a
  walkability overlay on its previews.
- **The dream module and map** name the town door and the town cluster.

The first dream passes through a logged allowlist entry until PT.2 removes it.

**Acceptance:** synthetic fixtures pin each check's finding; every number
lives in `map-tuning.ts`; the previews show the overlay.

#### PT.2 The first dream rebuilt around a starting town (creative)

`hv-j1n2.68`. The first dream becomes a medium map of at most 56×56 tiles.
The well square is its town: the town door, waypoint, inn door and quest
givers stand there. Its challengers, the guardian and the ember arch lie
beyond. New runs spawn at the topology's arrival door, which is the town
door.

- The brief and dialogue follow the new map.
- Saves whose anchors vanish arrive at the town door, logged.
- Every golden and milestone fixture still loads.

**Acceptance:** the map validates clean with no allowlist. Browser QA on
foot from a new run reaches every challenger and the guardian from town,
buys, completes a quest and reloads, with `window.__caps` empty.

#### PT.3 Design documents

`hv-j1n2.70`. Appendix B, the design README and the visual guide state P13's
sizes and P33's town and path rules.

PT.1 and PT.2 each have a review/QA bead (PT.1a `hv-j1n2.67`, PT.2a
`hv-j1n2.69`).

### Systems

Each system is a `core` or code bead with a paired review/QA bead, logs per
Appendix B §B17, and keeps every golden and milestone fixture loading.

#### 3.1 Dream catalog v1 (core)

The dream module schema for the catalog: size class, category and tileset,
the town door and town cluster ([P33](decisions.md#p33-towns-and-walkable-paths)),
residents by anchor (role, character, dialogue, deck), personas, quests with
roles, rooms, and the brief beside each module. The rebuilt first dream
(PT.2) moves onto it.

**Acceptance:** the first dream compiles, validates and plays as before; a
synthetic catalog test pins the schema's validation (missing anchors,
duplicate roles, unknown characters).

#### 3.2 Act assembly (core)

Appendix B §B4 steps 3–6 and §B7 for one act: choose the act's dreams,
build its topology, place guardians and the incarnation, bind quests across
dreams, fill anchors, retry with a seed salt. It links each dream's town door
on the side toward the act's entry dream, so the forward route's first
arrival in every dream is its town ([P33](decisions.md#p33-towns-and-walkable-paths)).
It stores the outcome in state
([P5](decisions.md#p5-saves-are-versioned-snapshots)), with migration v1→v2.
Includes the chokepoint rule validator (§B5).

**Acceptance:** `node` tests over a synthetic catalog pin determinism from
the run seed, the chokepoint rule, quest binding, town-door linking, retries,
and that a v1 save migrates; the assembly is logged with UUIDs.

#### 3.3 Doors

Veil states by door state (§B5, visual guide), blind traversal with the
veil fade, destination thumbnails once traversed, two-way linking, and
arrival at the matching door's entry.

**Acceptance:** traversal and two-way linking pinned in `node` tests;
browser QA steps through doors both ways and reloads.

#### 3.4 Waypoints and fast travel

§B6: each dream's waypoint, activation, and free travel between activated
waypoints outside battle.

**Acceptance:** activation and travel pinned in tests; browser QA travels
between two dreams and reloads.

#### 3.5 Dream Atlas

A D97 adapter over `AtlasNode` and `AtlasEdge` with unnamed thumbnail nodes
([P10](decisions.md#p10-dreams-are-unnamed)): entered dreams, traversed
doors, waypoint status, guardians seen and beaten, sage hints, quest
markers.

**Acceptance:** the view model pinned on a synthetic run; browser QA opens
the Atlas after a short route; no dream name appears.

#### 3.6 Curated pools

For each Avatar, pick one high-quality tides4 output (its starter tide,
three facets and the dealt pool) and pin it as the Avatar's D97 pool
([P29](decisions.md#p29-m1-economy-subset)); move the reward bag and its
layers (Appendix A §A2) onto the pinned pools.

**Acceptance:** every Avatar has a pinned pool; bag layers open on their
events; tests over synthetic pools.

#### 3.7 Dream Guide appearances

§B13: guide appearances placed by assembly in the dream's town cluster
([P33](decisions.md#p33-towns-and-walkable-paths)), with their home
tilesets, badges and one-use-per-appearance state.

**Acceptance:** placement pinned against §B13's counts on a synthetic act.

#### 3.8 Resonance cores, amulets and amulet merchants

Appendix A §A10: resonance cores, amulets, merchants and changers. Assembly
places the merchants and changers in town clusters.

**Acceptance:** purchases, changes and pricing pinned in tests; browser QA
buys and changes an amulet.

#### 3.9 Dream Guide services

The service adapters over the existing site screens (curiosities, Bazaar,
Revelation, Transfiguration, Duplication, Augury, Random Site, Gamble and
Exploration, per Appendix D), as D97 intents.

**Acceptance:** each service applies through its intent in tests; browser
QA uses three services.

#### 3.10 Sages

§B14: sage hints, marked on the Atlas. Sages stand in town clusters.

**Acceptance:** hints pinned in tests; browser QA asks a sage and sees the
Atlas mark.

#### 3.11 Chests and prize duelists

Appendix A §A13–A14.

**Acceptance:** chest contents and prize duels pinned in tests; browser QA
opens a chest behind a guardian and wins a prize duel.

#### 3.12 Dreamsign slots

Dreamsign slots, the slot quest, and adapted journey Dreamsign effects
(Appendix D §D6).

**Acceptance:** slotting rules and three adapted effects pinned in tests.

#### 3.13 The Act 1 incarnation and guardian picks

Appendix C §C1–C2 and Appendix A §A15.

**Acceptance:** the incarnation's setup and the guardian pick pinned in
tests; browser QA beats the incarnation and passes its exit door.

#### 3.14 Quests v1

Cross-dream roles, errands and deliveries between dreams, bound by assembly
(§B15), with a placeholder for the bound character's name.

**Acceptance:** a cross-dream quest pinned end to end in tests; browser QA
completes one.

#### 3.15 Master Takeshi's handicap trials

§B15's trials, fought by Takeshi himself.

**Acceptance:** a trial's constraint and reward pinned in tests.

#### 3.16 Dialogue conditions for the through-line

The conditions the story bible needs: act depth, Limbo, Apollyon's defeat,
inside a key dream, a guide's service used or enhanced, an empty guardian
spot, an earlier loss to an opponent, and which incarnations fell. The
guides' D97 dialogue gets its own typed graphs.

**Acceptance:** each condition pinned in the dialogue runtime's tests; the
validator knows them.

#### 3.17 Credits screen

Generated from the art-source manifest
([P23](decisions.md#p23-asset-sourcing-and-licenses)).

**Acceptance:** every source and license appears; browser QA opens it.

### Content ([P18](decisions.md#p18-dream-authoring-beads))

#### 3.18 Art sourcing

Source what each category the act's dreams need, and add stamps through the
2.3 tooling.

#### 3.19 Catalog dreams

About 8 dreams, each a concept-and-map bead (`creative`) followed by a
residents bead (`creative`). Together they cover at least three categories,
a mix of the compact sizes ([P13](decisions.md#p13-map-sizes-and-walking-speed)),
and enough guardian anchors for assembly. Each opens on a town around its
town door, with wide paths out to its challenges
([P33](decisions.md#p33-towns-and-walkable-paths)). Each follows the
creative bead rules in the workflow, against the story bible.

**Acceptance (each map bead):** the brief and map module land; the map
validates clean under PT.1's checks; previews with the walkability overlay
read well; the bead plays it once in the browser, on foot from the town
door.
**Acceptance (each residents bead):** residents, dialogue and quests
validate; the writing follows the story bible; the bead plays the dream.

Batched QA beads review two or three dreams each.

#### 3.20 Through-line dialogue

The Dream Guides' Act 1 appearance lines and the incarnation's lines,
against the story bible and 3.16's conditions.

### Phase end

#### 3.21 Refactor and tooling pass

The `mason` audit over Phase 3, filing beads that land within the phase.

#### 3.22 Retrospective

The read-only `sage` pass ([P30](decisions.md#p30-phase-end-introspection)).

#### 3.23 Gate review

A cold `warden` review of the whole Phase 3 diff.

#### 3.24 File Phase 4

Refine [Phase 4](phase-4-campaign.md) from its outline and file it.

#### 3.25 Phase 3 gate

1. Confirm `release` contains every Phase 3 commit.
2. Check that every golden and milestone fixture loads.
3. Commit the M2 milestone fixture ([P25](decisions.md#p25-tests)).
4. Record the build's OID in the epic notes, and close the epic.

## Exit gate

- Act 1 is playable end to end on desktop, with a mobile smoke check.
- Every Act 1 dream, the first included, is compact, opens on its town and
  validates clean under P33's path rules.
- Every Phase 3 system logs per §B17.
- Every golden and milestone fixture loads, migrated, and the gate commits
  the M2 milestone fixture ([P25](decisions.md#p25-tests)).
- Reviews are resolved.
- Phase 4 is filed.
