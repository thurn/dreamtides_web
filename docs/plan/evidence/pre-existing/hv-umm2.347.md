# Pre-existing evidence for hv-umm2.347

## Filed inventory-key scope pointers

`hv-umm2.205` records filing key `cards-93` and these explicit entity UUIDs:

- `4e1c0192-2649-489f-aad3-75ff2887c0a7`
- `742a376f-68db-466a-b087-405188634ba4`
- `78b5a42d-b099-48f1-a1b4-5b6bc177adeb`
- `96e2c30c-930c-47af-abb0-d4fbab454d56`

The fresh generator projects `cards-93` with these entity UUIDs:

- `4e3c04a9-1cdd-468a-b42a-40157ed9c9d6`
- `a75c22ac-e343-4757-964e-a0bb981b5a28`
- `edb479be-68a5-45bc-bd19-2602156edb57`

Its native description points at `content-inventory.json beads[key=cards-93]`.
The retained original filing projection contains 247 beads; the current
projection contains 239. Both enumerate the same 1,209 UUIDs. Across their
common keys, 99 have different entity memberships; 14 original keys are
absent and 6 current keys are additional. These are planning records. Native
filed Entities, Areas, acceptance criteria, and dependencies govern execution.
The parent session owns the native pointer amendments after promotion.

## Current generator baseline drift

At base `ad52da4e1f148e2a2cac276eebd664f5ccddc277`, the unchanged
generator `--check` exits 1 against the tracked inventory. The tracked and
fresh outputs both contain 239 planned beads and the same 1,209 entity UUIDs.
Fresh catalog data marks these tracked pending cards authored:

- `0211963d-d097-4427-9d16-5e857621e481`
- `19aeffa6-fd1b-4b8f-bb0c-c35659521976`
- `4b20e66e-2466-4518-8ef9-67f580bd6f14`
- `7dd2214f-8d16-453a-9f28-62712e64eae1`
- `8571d7b3-5401-4678-9e81-e14538c8c46e`
- `86fd585b-e9d0-4dc1-bce9-488014b9316d`
- `b049ba66-9334-4dd1-a7d8-6d8b32d9a0a9`
- `bc1c7ea9-e47d-49b8-a93a-8185b9cb40f2`
- `cea847ef-2d1f-45d2-a0e0-fe9ce3fec55c`
- `f256a0e7-e396-492b-8881-284ecd36025b`

The pending-card summary is 467 in the tracked output and 457 in the fresh
output. Embedded entity statuses in `cards-07` and `cards-08` reflect those
catalog records. Five prompt-bearing planning records have equal Areas and
sharedAreas sets in a different order: `prim-choose-player`, `prim-put-in-deck`,
`prim-return-from-void`, `prim-move`, and `prim-choose-subtype`. The fresh
projection additionally serializes `prim-return-from-void` after
`prim-put-in-deck`, `prim-move` after `prim-return-from-void`, and
`prim-choose-subtype` after `prim-move`, on `src/engine/policy/prompts.ts`.

The parent acknowledged these baseline deltas before regeneration. They are
captured separately from this bead’s explanatory note. Current before/after
generation is identical in all fields except `summary.notes[0]`; the script
source is identical except for that existing note string. Native tasks retain
their filed graph; projected edges are not native amendments.

Raw tracked baseline, fresh baseline, generated result, recursive drift, and
the original filing-key comparison are retained in the originating session’s
scratch `347-implementation-evidence/`.
