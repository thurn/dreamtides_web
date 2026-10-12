# hv-umm2.516 pre-existing observations

- `npx tsx scripts/content-inventory.ts` exited 1 on base f8f5341d3: the
  `whenReturnTrigger` (Trigger `returnToHand`, landed in 0d8c0a97c) and
  `materializeNthTrigger` (Trigger `materialize` with `nth`, landed in
  39c84fe7a) bindings were present while still declared pending. Both are the
  intended bindings; this bead retires the markers. The tracked inventory was
  stale against the catalog (218 planned beads, 78 entity records with new
  statuses or decision links), and the regeneration here carries that refresh.
- The `selector-bounds` rule has no alternative for a constant "≤N● cost"
  character bound ("Dissolve a ≤2● cost enemy" tags only `dissolve`), so those
  entities do not list `selectorBounds`. The capability exists, so no planning
  edge is lost.
- The `card-filter-bounds` alternatives "with N✦, materialize" and "≤1✦
  character, materialize" read a "when you materialize" trigger's
  CharacterSelector ✦ bound (The Deathsworn, 1ce0f0f2-4b1a-483d-b93b-74c36e946a08) as a CardFilter cost
  bound. Both capabilities exist; the entity also carries `selectorBounds`.
