# Pre-existing issues found by hv-n5lj.22

Measured on production builds at staging `fd3208051`; see
`docs/plan/evidence/measurements/hv-n5lj.22.md`.

- **Every stat digit fit is a full binary search**
  (`src/cumulus/components/card/CardStatOrb.tsx`,
  `src/cumulus/components/card/CardView.tsx` `ENERGY_ORB_RATIO` /
  `SPARK_ORB_RATIO`): the search ceiling `numberCapPx` sits above the digit
  box by design, so no digit fits at the ceiling and each fit runs all 14
  steps, 15 forced layouts per digit. A card mount spends 30 of its 31 fit
  layouts on its two digits; on the near side's turn-start frame this is
  most of the 11–16 ms of `fits`.
