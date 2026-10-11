# hv-umm2.61 pre-existing findings

## Cost contract test module size

`src/engine/rules/costs.test.ts` has 745 lines at base `6598ebacf8f06c053413a9daa0d4af485262b495`, above D19's approximate 500-line split-or-cut threshold. The module spans additional and activated costs, transaction recovery, feasibility budgets, assignment matching, and self-abandon contracts. This bead adds its synthetic discard-cost contracts to the existing node-environment cost module as directed; it introduces zero test files and zero jsdom files. A bounded test-module organization task can separate those established contract groups without adding per-card tests.

## Dependency audit output

The fresh-worktree `npm install` emitted 17 audit findings: 9 moderate, 7 high, and 1 critical. The install completed successfully. This bead's commit includes no dependency or lockfile changes.

## Mandatory whole-hand cost primitive

The inventory credits `discardCostFilter` with mandatory whole-hand payments.
That distinct form is required by Gilded Catalyst
`0bddeb19-ff49-4a77-bc06-955377ba3ed1` and Liminal Dreamer
`8e7b0eb9-4933-420b-abee-413bf5b3d2fc`. The current fixed/count-X/captured-cost
forms cover this bead's three entities. Follow-up `hv-umm2.334` owns mandatory
whole-hand support, ordered before dependent content beads `hv-umm2.95` and
`hv-umm2.130`, and after the existing cost-body seam `hv-umm2.92`.
The shared CardFilter copiable-cost bounds are present from `hv-umm2.66`.

## Mobile card-lab debug toggle placement

In the existing `debug=1` card-lab layout, the floating engine-debug toggle
encroaches on the right edge of the precommit prompt's Cancel button at
390×844. `discard-nine-prompt-9-mobile.png` captures this shared debug-overlay
positioning. The actual cancel interaction succeeds and preserves the
committed hand and energy in this bead's mobile cost workflow. This observed
QA-overlay issue belongs to the shared debug positioning outside this
content/rules scope.
