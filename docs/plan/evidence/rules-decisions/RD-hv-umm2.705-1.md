# RD-hv-umm2.705-1: Actual void origin qualifies the matching play cohort

- Ladder: D10 step 1, application of the current First and nth play costs and
  current-turn occurrence rules to the literal origin clause. No new residual
  player-rule ambiguity is introduced.
- Rules: docs/rules.md, Costs, Requirements, and X → First and nth play costs.
- Affects: `044f856b-c08b-4b82-81e3-5417962bf868` (first event played from the
  void sets its normal fixed base to 0) and
  `5190a8b8-25a0-4c60-a4de-2e2c5a73af77` (first card played from the void
  costs 1 less while its discarded-card condition holds). Their original
  authoring beads retain the full UUID implementation and acceptance.
- Outcome: the candidate starts in the void and its earlier matching cohort
  consists of actual committed void plays by the payer, before payment.
  Reclaim, permissions, card alternatives and immediate instructions qualify
  according to actual origin. A hand or deck play does not occupy that cohort.
  Copies, failed plays and cancellation add no play. Ordinary and extra turns
  reset both sides, and earlier plays count before a source or condition applies.
- Composition: RD-hv-umm2.104-1 supplies the existing normal-base setter and
  replacement-base distinction. Origin qualifies the ordinal; it changes
  neither that distinction nor X, additional payments, taxes or reductions.
  RD-hv-umm2.513-1 supplies current conditional-static evaluation.
- Engineering: each successful shared commit captures an optional public
  historical boolean before payment/movement. Missing legacy provenance is
  unknown and is not inferred from a current zone or Reclaim status. It
  conservatively withholds only the new origin-qualified modifier. This saved
  input policy is separate from the player rule. Existing record copying,
  serialization, hashing and anonymous views carry the field without a new
  provenance, log or migration framework.
