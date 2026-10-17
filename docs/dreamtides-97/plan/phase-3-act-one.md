# Phase 3: Act 1 (M2)

**Status: outline.** Bead 2.9 turns this into a full page before filing
([workflow § Filing a phase](workflow.md#filing-a-phase)).

**Goal:** a full assembled Act 1, played from Avatar select to the Act 1
incarnation and through its exit door. That means:

- about 8 catalog dreams across at least three tileset categories, joined by
  blind doors;
- waypoints and fast travel;
- the Dream Atlas;
- Dream Guide services, sages, chests and prize duels;
- amulets and their merchants;
- Dreamsign slots;
- the incarnation guarding the act.

[Back to the plan](README.md)

## Earliest start

The phase starts after 2.2 and 2.4, so the refactors and the story bible are
in place. Content beads also wait for 2.3.

## Task outline

**Systems** (each a `core` or code bead, with a paired review/QA bead):

- **Dream catalog v1.** The schema for dream size, residents, personas,
  quests with roles, tileset and category. The first dream moves onto it.
- **Doors.** Veil states by door state (Appendix B §B5, visual guide), blind
  traversal with the fade, destination thumbnails once traversed, and two-way
  linking.
- **Act assembly** for one act (Appendix B §B4 steps 3–6 and §B7), with:
  - the chokepoint rule validator;
  - quest binding across dreams;
  - retries with a seed salt;
  - the outcome stored in state ([P5](decisions.md#p5-saves-are-versioned-snapshots)).
- **Waypoints and fast travel** (§B6).
- **The Dream Atlas.** A D97 adapter over `AtlasNode` and `AtlasEdge`, with
  unnamed thumbnail nodes ([P10](decisions.md#p10-dreams-are-unnamed)).
- **Curated pools.** For each Avatar, pick one high-quality tides4 output (its
  starter tide, three facets and the dealt pool) and pin it as the Avatar's
  D97 pool ([P29](decisions.md#p29-m1-economy-subset)). Then move the reward
  bag and its layers (Appendix A §A2) onto the pinned pools.
- **Resonance cores, amulets and amulet merchants** (§A10).
- **Dream Guides,** in about three beads: appearances and placement (§B13);
  then the service adapters over the existing site screens (curiosities,
  Bazaar, Revelation, Transfiguration, Duplication, Augury, Random Site,
  Gamble and Exploration, per Appendix D); then Master Takeshi's handicap
  trials (§B15).
- **Sages** (§B14), with hints marked on the Atlas.
- **Chests and prize duelists** (§A13–A14).
- **Dreamsign slots, the slot quest** and adapted journey Dreamsign effects
  (Appendix D §D6).
- **The Act 1 incarnation** and guardian picks (Appendix C §C1–C2, §A15).
- **Quests v1:** cross-dream roles, errands and deliveries between dreams.
- **The credits screen,** generated from the art-source manifest
  ([P23](decisions.md#p23-asset-sourcing-and-licenses)).

**Content** ([P18](decisions.md#p18-dream-authoring-beads)):

- **Art sourcing** for each category the act's dreams need, adding stamps
  through the 2.3 tooling.
- **About 8 catalog dreams,** each a concept-and-map bead followed by a
  residents bead. They cover at least three categories, a mix of sizes, and
  enough guardian anchors for assembly.
- **Batched QA beads,** one per two or three dreams.
- **Through-line dialogue** for the Dream Guides' Act 1 appearances and the
  incarnation.

**Phase end:**

- the refactor-and-tooling pass;
- the retrospective;
- the gate review;
- filing Phase 4;
- the gate.

## Exit gate (draft)

- Act 1 is playable end to end on desktop, with a mobile smoke check.
- Every Phase 3 system logs per §B17.
- Every golden and milestone fixture loads, migrated, and the gate commits
  the M2 milestone fixture ([P25](decisions.md#p25-tests)).
- Reviews are resolved.
- Phase 4 is filed.
