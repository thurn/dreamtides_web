# Pre-existing evidence for hv-umm2.357

## Current generator baseline drift

At base `97b63be39`, the unchanged generator `--check` exits 1 against the
tracked inventory (`docs/plan/evidence/content-inventory.json`). The tracked
and fresh outputs enumerate the same 1,209 entity UUIDs. The fresh output
reflects primitives and cards that landed after the tracked file was written:

- `choosePlayer`, `eachPlayer`, `putInDeck`, and `shuffleInto` exist, so the
  projection plans 67 primitive beads instead of 71 and drops the planning
  records `prim-choose-player`, `prim-each-player`, `prim-put-in-deck`, and
  `prim-shuffle-into`; it adds `cards-103` and `cards-104`
  (239 planned beads become 237).
- Pending cards: 457 tracked, 448 fresh. These tracked pending cards are
  authored in the catalog:
  - `28f8d95a-be99-4b4c-b9ef-92a4b40fffe7`
  - `31ecf933-c897-41a5-ab94-822ea65898d8`
  - `3725379c-676d-4efd-81ee-7e45d80db6d0`
  - `50fe6c54-4bf2-4177-a2f7-4c00a4a4c188`
  - `570895fe-cd21-45d2-89ff-162f46978776`
  - `5ce69085-aa75-4654-8abe-f9e773931e63`
  - `bedee263-27b9-4d73-ab77-6b5c747dff69`
  - `f4b34207-2ad4-421b-8798-9c20320607ae`
  - `ffa4fa56-8897-465d-b812-3798e3cf5a1f`
- 97 planning keys common to both outputs group different entities.

These are planning records. Native filed Entities, Areas, acceptance
criteria, and dependencies govern execution; no native bead is refiled.
