# RD-hv-umm2.142-1: Annular Recall picks X before its target and may be played for X = 0

- Ladder: 1 (the contextual X = 0 rule in rules.md § Costs, Requirements, and X; C13 makes every figment cost 0●), following RD-hv-umm2.55-2 and RD-hv-umm2.66-2.
- rules.md: § Costs, Requirements, and X (X costs); § Targeting.
- Affects: a8bca1eb-abc8-42e0-b770-0f03af250b81.
- Why: "Return a character with cost X● to hand" uses its paid X only as the exact copiable cost its target must have. rules.md did not say whether X or the target comes first. The engine's play step already picks X before the play-time targets and binds X-valued selector bounds to it (`chooseX`, then `choosePlayTime` with `selectorX` in `src/engine/steps/kinds/play.ts`), so the target prompt offers only characters whose copiable cost equals the picked X, and a pick with no such character is an empty target prompt that makes the play illegal. Returning a 0● character, a figment above all, is a meaningful effect, so X = 0 is legal: the card's `xMinimum` is 0. Encoded as `returnToHand(target(anyCharacter(costExactly(x()))))`, then `draw(1)`.
