# RD-hv-umm2.277-1 — Kindled printed variable spark

- Card: f40df441-0e44-4122-b4d4-cdc4085a9ffb (transfiguration); affected printed-X Characters: 9d51dca1-28d7-4e8e-bc13-c5b665d6db72 and c92a7dc0-04b0-4c54-9485-59a92505eabc.
- Question: How does Kindled treat printed variable X or absent Character spark, and how does a chosen X interact with it?
- Decision: Numeric nonzero printed spark doubles; zero, variable X and absent Character spark become fixed 1. The ordinary chosen X pays the cost and stays recorded as X; it does not replace this fixed base. Permanent entry spark modifications apply after the form. Events are ineligible. Other characteristics and authored abilities remain.
- rules.md: [Transfigurations](../../../rules.md#transfigurations).
- Ladder: D10 step 2, actual prototype. `operationForKindled` selects Characters and `doubleSpark` with zero result 1; `applyStatStep` uses `card.spark ?? 0`. `CardView` presents a numeric spark before its variable-X flag. These are the ordinary transfiguration/display paths. No explicit D/C/P clarification supplies a different Kindled-X rule.
- Evidence: Source base `2fc03fa05124766208fe2c944747616de6875d3e`; `src/transfiguration/transfiguration-logic.ts`, `src/content/transfiguration.ts`, `src/cumulus/components/card/CardView.tsx`. Parent ruling and full hashes: `d10-kindled-x-ruling.json` in the session scratch. Synthetic public contracts distinguish fixed 1 from doubled paid X, preserve payments and prove permanent-modification ordering. Card data is immutable; this rules interpretation requires no card issue.
