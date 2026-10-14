# hv-umm2.190: full original cards-78 acceptance

The batch retains all four original UUIDs and reads the two authored child 675 modules unchanged. The two event encodings use existing draw/cost/history/choose-player/erode forms. Printed data, shared engine and QA source remain byte-identical.

The private plain scenario module adds 12 cases (138 lines) with synthetic filler and public engine actions: current-turn source inclusion, actual successful draw cohort, zero-cost play, Ephemeral cleanup and cost expiry, short/empty decks, both player recipients with controller-relative counts, and reset between own plays. The reset case alone does not distinguish global-turn reset from an own-turn-only implementation. Existing 105 primitive controls and 20 content gates passed. No new runtime state machine or format is introduced.

The initial focused run passed 8 cases and failed 4 after their effect checks because an assertion read nonexistent RecordedAnswer.prompt. The corrected public auto/value assertion passed all 12; the original failure epoch remains in measurements.

The initial required review found TS2339 and a lint error in one assertion's event-filter narrowing, while its related tests passed. An equivalent flatMap gives TypeScript the event kind inside its branch. Only that private assertion line changed after the weighted run and sweep; production abilities, child leaves and trusted drivers remain exact. The final focus and required review validate the corrected scenario. The before/after hashes and exact diff are retained in measurements.

Weighted 300 passed 100559 steps with zero failures. Driver 352.8s wall / 372.8s CPU; outer 354.605211s includes startup, shared-lock admission and collection, so their difference is not pure lock wait. Inclusion/exercise: 4ef8b2e7=609/103,95d37f76=621/392,874d5e8f=615/52,29d25251=613/106. These are observed coverage rather than statistical thresholds or full per-clause proof.

Preflight passed 46 eligible cells and skipped 34 ineligible cells across all original UUIDs, all variants and both controllers. The unchanged trusted browser sweep records its actual 80-cell outcomes and invocation paths in this bead's ledger; it supplies scripted QA, not human judgments. D21 SHA bytes 180/28/144/160 are unsampled; all presentation kinds exist, so the mandatory judged set is empty.

Required review passed 6,968 related tests across 253 files; it is not a full-suite D19 low-load budget measurement. Review and Knip outcomes, process groups, exact source epochs, timings and host loads are in the measurement JSON. No full review is needed for this composition. D10 adds no ruling: current normative rules govern every clause. No card issue or pre-existing source defect was encountered. The helper's read-only filename/glob errors were corrected without repository changes.

The friction start is the parent's post-claim envelope before setup; exact helper dispatch/sampling start is unknown. Its end is the writer's observation immediately before automatic finalization; the external finalizer receipt records the actual commit and remaining validation tail. The schema and whitespace are validated after all own paths are staged.
