# Pre-existing issues found by hv-umm2.102

- `scripts/content-inventory.ts` still marks the `whenReturnTrigger` capability's binding `pending: "member"` (and `whenPlayFromVoidTrigger`'s `pending: "option"`); with the `Trigger` member `returnToHand` now present, the inventory resolver's `validate` reports a fulfilled pending capability when the inventory is regenerated. The script belongs to bead 5.1 and is outside this bead's areas.
- `src/engine/testing/lab-solver.ts` places no character for a ▸Materialized character target whose selector is `controller: "any"` (only `"you"` targets get one, from this bead), so a card such as "▸Materialized: Return a character to hand" with an empty board can choose its own card and leave play; none such is authored yet.
