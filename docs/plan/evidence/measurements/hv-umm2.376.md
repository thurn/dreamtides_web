# hv-umm2.376: Interrupt discard trigger ordering

Base: `47d5994a30c0635bca4926f64ed10962c8bad9dc`.
Native claim: 2026-10-11T14:06:03Z. The friction implementation duration uses
claim-to-evidence time as the conservative dispatch-to-commit approximation.

## Observable contract

One synthetic contract uses public engine play actions to put a Standard event
on the stack and play an enemy Interrupt above it. The Interrupt makes its own
controller discard the sole remaining hand card, whose void ability grants
Reclaim. An in-play discard watcher gains energy for the same discard.

The contract checks the legal Interrupt response and pending underlying card,
the watcher-before-self trigger queue and resolution sequence (D14), and both
observable effects before the underlying card's resolution and energy effect.
Final energy, Reclaim costs, empty stack and empty trigger queue complete the
assertions. Synthetic catalog data makes the observation independent of live
content, copy, default policy or timing. Existing assertions are preserved.

## Negative probe

A temporary driver mutation drains queued triggers only when the stack is empty.
The new contract fails at its resolution-order assertion: observed Interrupt,
underlying item, watcher, self-trigger; expected Interrupt, watcher, self-trigger,
underlying item. Driver bytes were restored in a finally block before positive
checks. Original and restored SHA-256:
`64f87d5ef187b1a4a20c00c8030eea4bd662c70be1f24154829e46e733bdcfde`.
The production driver has no committed delta. No runtime defect was uncovered.

## Validation

Fresh `npm install` completed in 2.913 seconds. Initial fixture iteration corrected
an unnecessary scripted answer for the one-card automatic discard and the state
energy field name; these are test-authoring errors. The first positive focused
run passed all nine whenDiscardSelf cases. The negative probe failed as intended.

Final checks on the final contract bytes:

- Focused whenDiscardSelf: 9 passed, 372 skipped; wrapper 3.129s; one-minute host load 18.47.
- Required review: lint, both typechecks, import cycles and 381 related contracts passed; wrapper 8.348s; one-minute host load 18.35.
- Knip passed; wrapper 2.116s; one-minute host load 17.04.

Final focused phases: prepare 0.6s, test 1.7s, restore 0.6s. Final review phases:
prepare 0.6s, lint 1.7s, node typecheck 0.8s, import cycles 1.0s, application
typecheck 1.2s, related tests 4.0s, restore 0.6s. Review stages overlap; their
sum is not wall time. Knip phases: prepare 0.6s, knip 0.8s, restore 0.5s.
Tests use the shared Node contract runner with two workers.

The full contracts runner also passed 381 cases before the parent requested the
additional explicit underlying energy-effect index assertion. Initial review
passed in 10.630s and knip in 2.964s. The final checks above cover that refinement.
All logs and precise wrapper/load records are retained under
`/tmp/hv-umm2-376-checks/`; no heavy-slot work was required.

Test delta: one contract, zero new test files, +40 lines in the existing contract
module, 308 total lines, zero jsdom files. No engine hub or other fallout edit.
No new rules decision, card issue, production/content/UI behavior, prompt, or
runtime process. Browser QA, full-suite validation and fuzzing are not needed
for this bounded coverage addition. All check commands settled; no dev server,
browser, worker provider or long-lived worktree process was started.

