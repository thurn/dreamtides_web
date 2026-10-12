# hv-utwo pre-existing observations

The saved-state boundary checks zone consistency in one direction only. `hasConsistentZones` in `src/rules/battle/fold.ts` requires every card stack item to name an instance in the `stack` zone, but it accepts an instance whose zone is `stack` with no stack item naming it. A probe of this bead's queued Reclaim fixture with its stack emptied still parses, with the Reclaim card left in the `stack` zone. The saved-state contracts in `last-known-source-spark.contracts.ts` vary only the retained field of real queued, floating, and stacked records, so they do not depend on this gap. Production code is outside this bead's areas and remains unchanged.

The workspace-preparation step emits missing-art warnings while it links review materializations; the focused, review, and knip checks pass.
