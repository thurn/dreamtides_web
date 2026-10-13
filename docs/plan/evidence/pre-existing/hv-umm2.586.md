# Pre-existing observations for hv-umm2.586

The journey snapshot importer checks `siteRuntime` through its object guard and selected runtime-specific fields. Its Reward checks accept a runtime whose `accepted` field is the string `"false"`, and the object guard accepts an array container. The parent observed these through the public `LOAD_STATE` reducer in `reward586-parent-import-contract-repaired` and `reward586-parent-import-valid-shape` (exit 1 because the authored expectations required rejection), and verified the current parser in `src/rules/journey/lifecycle.ts`.

This parser behavior is outside the admitted `completeSite` entry-guard repair. The atomic import rejection control for this bead supplies a null `siteRuntime` container, which the existing parser rejects, while the decline contracts cover correctly typed pending, accepted, missing, and wrong-kind runtimes. A separate snapshot-parser change can validate the Reward runtime's accepted scalar and plain-record container.

`LOAD_STATE` imports assign a deterministic new journey run identity. LocalLog checkpoint/history restart and native same-game browser reload supply the identity-preserving replay controls for this bead.
