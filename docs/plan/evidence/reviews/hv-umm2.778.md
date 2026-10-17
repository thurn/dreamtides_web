# hv-umm2.778 implementation evidence

Base: `1b54f5e1dfd8d571a9bae49b1e01047d77237cdf`.

## Public regression evidence

`chooseSubtype graph bindings` runs synthetic authored instruction graphs through
public play actions and the fold adapter for both controllers. On unchanged
production source, the original six cases produce four failures: captured draw
cost is 0 instead of 3 for each controller, and each shared target raises an
extra target prompt. The two distinct equal-looking target controls pass.
Original inputs, process receipts and output are retained in the dispatch
scratch directory `subtype-captures778` as `before-fix-contract.ts`,
`before-fix.source-status.txt`, `before-fix.receipt.json`, and `before-fix.log`.
Original test SHA256:
`eedc8eed31a4cd436c7e81e81f4e1d01cdb571cfb325f39dca710d54656b1c77`.

## Failure and recovery paths

Each named contract below runs for `player` and `enemy` in
`choose-subtype-captures.contracts.ts`.

- Error mid-step: `rolls captured gameplay back after a mid-step error and replay`
  observes captured score 3 before suspension, injects a synthetic error after
  resolution, and checks that gameplay returns to the committed boundary and
  emits no new published events. Saved replay produces the same failure outcome.
- Reload/restart: `retains nested and enclosing captures through saved-step replay`
  serializes a pending fold slice, recreates the adapter, and compares its prompt,
  completion and final state with uninterrupted fold and scenario resolution.
- Partial write: the same two tests inspect the published display after a draw
  while the fold retains its committed boundary. Error recovery restores that
  boundary. Captures and object aliases are transient resolution data rebuilt
  from recorded answers; they have no separate persistent write.
- Invalid/stale input: `retains nested and enclosing captures through saved-step replay`
  rejects an out-of-zone UUID, a changed attempt fingerprint, a foreign side,
  and a repeated answer after completion; legitimate completion still scores 6
  and applies the shared target exactly once per instruction.
- Concurrent actors: that contract rejects a second action during the pending
  step and a foreign actor's answer. The local fold serializes intents; this
  change introduces no concurrent writer or external operation.
- Cancellation: that contract checks `notCancellable` for a deferred target
  prompt. Existing `chooseSubtype` contracts check the subtype prompt's same
  committed-resolution boundary.
- No valid target: `keeps a captured draw and trailing effect when the chosen type has no legal target`
  observes one subtype answer, `noLegalTarget`, the selected physical draw UUID,
  and captured score 3 from the trailing instruction.

Other contracts cover inherited modal choice zero and target selection across
replacement, one payable shared duration,
shared versus distinct equal-looking targets, graph input immutability, nested
composition and captures consumed by an enclosing later sibling.

## Scope and review handoff

Behavioral paths are `choose-subtype.ts`, `effects/interpreter.ts`, and
`effects/types.ts`, with one admitted public contract file and current-system
engine documentation. Mechanical fallout: none. No UI/browser workflow changes,
new rule decisions, card issues, event kinds or persistent state fields.
The parent session supplies a fresh read-only Codex core review against the
exact committed source and handles all Tollgate operations.

## Validation scope

The passing quick review uses the final production source and the contracts
before the final two enclosing-target cases. The final focused run passes all
37 chosen-subtype tests. The single D17-locked full review uses the final source
and all final tests: 439 files and 12,341 tests pass, as do full lint, both
typechecks, unused-code checks, import-cycle validation, evidence schema and
production bundle. Exact SHA256 inputs, actual process exits, child CPU, wall
times and starting host loads are in the bead's measurement JSON. The separate
standalone unused-code check also passes. All validation process groups have
exited; a process-table inspection found no surviving worktree or synthetic
validation-fixture processes. Browser captures and a local fuzz smoke do not
apply to this bounded internal composition repair.
