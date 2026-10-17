# Phase 6: Calibration and Polish (M5)

**Status: outline.** Its filing bead turns it into a full page.

**Goal:** measure the campaign against
[Appendix E](../appendix-e-calibration.md) and tune it, then polish the
prototype for long play on desktop and mobile, and close the stream.

[Back to the plan](README.md)

## Earliest start

The phase starts at the Phase 4 gate. The simulator can start once Phase 4's
assembly and economy systems have landed.

## Task outline

- **The run simulator** (Appendix E §E6). A headless runner that drives
  intents through the real reducer, with three challenge policies:
  minimum, happy path and full clear. It resolves battles from a win-rate
  model by tier, head start and difficulty, and it is seeded and
  deterministic. Its reports cover every §E6 metric by act and by encounter
  type.
- **Calibration loops.** Each loop is one bead: change tunables in
  `src/content/d97/`, rerun the simulator, and write
  `evidence/calibration/<bead-id>.md`. The minimum-route check hardens the
  late bosses before it shrinks rewards (§E6).
- **The collection at 250 cards:** filtering, sorting and deck editing at
  that scale.
- **Large-map performance** on phones.
- **Mobile polish** of the controls and HUD.
- **Final acceptance:**
  - a full campaign on desktop and mobile;
  - an endgame session;
  - a save from each milestone loading in the final build.
- **Documentation end state.** Update the design documents and README to the
  delivered game. Write `report.md`. Delete the rest of
  `docs/dreamtides-97/plan/` except the dream briefs, which move beside their
  dream modules.

## Exit gate (draft)

These are the [done criteria](README.md#done-criteria).
