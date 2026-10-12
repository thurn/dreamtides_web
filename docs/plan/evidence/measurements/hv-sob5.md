# hv-sob5: Mandatory cost-captured X before activation targeting

Base: `1135fe84f9a5bf3a7b760fea63c0bd6693a879e5`.

Read-only public engine reproductions at this base found no activation for a
fixed 1 energy plus mandatory discard X with three eligible hand cards,
stored source X null, and a two-spark enemy. A fixed 1 energy plus one
copiable-cost capture likewise offered no activation when a two-cost hand
card could pay and a two-spark enemy existed. With stored source X 3, the
count form offered a three-spark target, accepted one discarded card,
spent the fixed energy, and emitted `noLegalTarget` at resolution.

The supported activation forms are top-level mandatory discard counts,
payer-void banish counts, discarded-card copiable-cost captures, and
abandoned-character copiable-cost captures. Preparation occurs when an
immediate character or void target bound reads X, including a target in a
modal branch. Registry children and target readers discover those bounds;
deferred-only effects retain their targetless choice protocol. Existing
energy-X and abandon-X numeric preparation retain their protocols.

Count X and copiable-cost X bind the immediate modes, targets, later
character-cost selectors, and resolving stack item. A separate actual
energy-X part controls the variable energy debit. A count payer holding
only its fixed one energy can choose X 2. Prepared captures carry their
physical payment cards into normal cost planning, where target exclusions,
earlier payment exclusions and shared X equality are checked. Payment
occurs in printed order after the existing commit point. The source's
stored X does not receive this activation binding.

Nested optional and alternative costs keep their own post-target planning
protocol. Their X dependencies, self-referential capture selectors, and
card play preparation need their own semantic admission and are outside
this bead's supported forms. This record makes no coverage claim for them.
The normative rules in Costs, Requirements, and X settle the supported
binding and payment semantics; no rules decision or card issue was created.

## Deterministic contracts

One plain contract module adds 78 cases, covering both controllers and null
or stored X for all four forms. Public legal actions and applications prove
that the two-spark target resolves with X 2. Additional cases cover shared
energy-X equality and debit, modal legality, later cost selectors, zero
count admission, combined count and capture, distinct joint payments,
source abandonment, void target/payment reservations, early capture versus
preceding payment, and targetless and deferred-only prompt sequences.
Synthetic definitions, physical instance IDs and stable observable state
and events are used throughout. No production catalog or UI copy assertion
is part of these deterministic contracts.

## Core transition failure paths

- Error mid-step: each controller/form has a preparation error contract,
  preserving the input state. A synthetic paying step using the same
  preparation/planning/payment boundary errors after energy and card writes;
  the fold preserves committed state and publishes no payment events.
- Reload mid-operation: every outstanding prefix is serialized and rebuilt
  with a fresh engine/fold adapter. Pending prompts and final state hashes
  agree with inline execution.
- Partial write: every prefix leaves the committed board unchanged; the
  after-payment error contract proves rollback of the private work copy.
- Invalid or stale input: every prefix rejects malformed choices, old prompt
  IDs, cancellation/reopen aliases, and a target fingerprint from another X.
- Concurrent actors: every prefix rejects the other controller's answer and
  a second battle action while the step is in flight. Reusing a completed
  answer cannot apply payment twice.

The prepared plan is local to a replay of one step; there is no persistent
schema or independent writer boundary. Existing engine events announce the
normal prompts, committed intent, energy changes, and card payment. The pure
engine/host logging boundary is retained.

## Validation and resources

Validation measurements and the dispatch-to-commit timestamp provenance are
in the adjacent JSON record. Browser QA was not required for this headless
protocol repair: there is no UI or presentation change. No captures, owned
application server, browser session, or production deployment was created.
Full validation's synthetic QA resource tests manage their own temporary
servers and assert cleanup. The implementation helper ran no Beads,
Tollgate delivery, branch, push or review CLI command. The parent session
schedules the fresh read-only Sol CLI review under the temporary routing
policy after the immutable commit handoff.
