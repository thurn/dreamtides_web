# Dream Atlas Unseen-Dream Production Incident

Date: 2026-07-29  
Production room: `g2jfb2`

## Impact

A battle victory advanced the displayed completion count and returned the
player to the Dream Atlas, but the next frontier retained unassigned
Dreamscapes. Two choices rendered as “an unseen dream,” blocking the expected
journey and disrupting the production demonstration.

## Causal chain

The room log reached a terminal victory board and committed `END_BATTLE`. That
reducer case updated completion bookkeeping and tore down the battle slice. A
React completion bridge was responsible for the remaining victory work:
completing the Battle site, applying the reward, advancing the Atlas, and
routing the journey.

The committed reducer state had already removed the terminal battle data the
bridge needed to perform that work. The Atlas stayed at its pre-victory
generation depth while `completionLevel` advanced. Replay reproduced this
partial state deterministically on every client.

The investigation also found a second Atlas fold defect. Node and site IDs used
module-global counters. An optimistic fold could consume those counters before
the confirmed refold, producing different IDs from another client folding the
same event. The expanded built-browser oracle detected this as a same-head,
different-hash failure.

## Why event sourcing did not prevent it

The fold architecture guaranteed that all clients replayed the committed
transition consistently. It did not guarantee that the transition represented
a complete domain operation. Victory ownership was split across the reducer and
a React observer, so the log contained a deterministic partial transaction.

The missing architectural contract was atomic handoff completeness: a terminal
event must retain its source state until it has derived every destination field,
and the reducer result must satisfy semantic invariants before it can become a
confirmed state.

## Detection gaps

- The `END_BATTLE` unit test asserted completion increment, modifier expiry, and
  battle teardown, but did not assert site completion, reward, Atlas expansion,
  assigned frontier, or route consistency.
- The journey-flow integration test called Atlas advancement manually. It tested
  the generator while bypassing the production event path that had omitted it.
- Replay stamped a victory payload supplied by the client onto a board that was
  not terminal. Its final assertion checked battle teardown rather than the
  complete journey delta.
- Random fuzzing treated convergence, absence of throws, and JSON purity as its
  primary oracles. Two clients could converge perfectly on the same broken
  state.
- Browser smoke reached battle and edited a score. It did not win, continue to
  the Atlas, reload, or assert the resulting journey state.
- Atlas generator tests reset module counters between examples, masking
  optimistic/confirmed refold history.

## Engineering philosophy correction

Event sourcing, reducers, and deterministic replay are mechanisms. The product
contract is the semantic state transition. Correctness therefore requires all
of the following:

1. One authoritative owner for each cross-domain transition.
2. Intent-only event payloads with outcomes and prices derived from folded
   state.
3. Atomic terminal events whose tests enumerate the complete state delta.
4. Invariants that reject dangerous partial states independently of the event
   that produced them.
5. Fuzz oracles that judge domain meaning as well as convergence.
6. Certification against the built application through the user-visible
   terminal workflow and reload.
7. Reconstruction logs that state what the transition derived and committed.

## Controls

The current contracts and release checks are defined in
[Authoritative Transitions](../journey_prototype/authoritative_transitions.md)
and [Cooperative Demo Fuzzing](../journey_prototype/coop_demo_fuzzing.md).
`END_BATTLE` owns the full victory transaction. Fold invariants cover completion
depth and assigned frontier. Replay, model fuzzing, real-content integration,
and built-browser certification each exercise the authoritative terminal event.
