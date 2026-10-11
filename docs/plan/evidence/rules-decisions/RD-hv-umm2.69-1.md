# RD-hv-umm2.69-1: Conditional discard alternatives count the hand before discarding

- Ladder: 5 (simplest reading consistent with the printed conditional alternative).
- rules.md: § Playing Cards and the Stack → Conditional alternatives.
- Affects: fbf32510-0bad-4567-859f-b3db6d7be5d5 (amplified).
- Why: "two cards instead" selects an alternative to the single-card discard;
  it is not an additional discard after that instruction. The condition checks
  the opponent's hand when the effect resolves, after responses, before any
  cards leave the hand for this instruction. A hand of exactly five therefore
  loses two cards. Existing discard behavior handles short and empty hands.
- Ladder checks: D/C/P entries contain no entity-specific clarification;
  this prototype's module is pending at the base and has no rule implementation.
  The Rust reference catalog/rules search found no matching conditional discard
  text and its battle rules use an older ruleset. No specific MTG card text
  is required for this direct reading of the printed alternative.
- Encoding: `ifThen(conditionCardCounts("hand", 5, { player: "opponent" }),
  discard(2, "opponent"), discard(1, "opponent"))`; both forms keep
  `reclaim(discardCost())`. The flow primitive contracts cover the boundary,
  response-time changes, short hands, and cost/effect ordering.
