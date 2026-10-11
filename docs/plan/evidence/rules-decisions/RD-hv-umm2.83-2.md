# RD-hv-umm2.83-2: "With higher cost" after an abandon cost compares with the abandoned character's captured cost

- Ladder: 5 (simplest reading consistent with the card text), applying the existing normative abandon-cost capture rule.
- rules.md: § Costs, Requirements, and X → abandon costs; § Zones → References to cards in a zone; § Keywords and Effects → Reclaim.
- Affects: 7b55efd1-6d9f-4156-9de7-1c71ccc410cb (base; no amplified text).

Stolen Genesis reads "To play this card, abandon a character. Materialize a random character with higher cost from your deck." The comparison has no stated antecedent; the only character the card names is the abandoned one, so "higher cost" means a copiable cost greater than that character's. The value is captured before payment from the abandoned character's copiable values, as the existing abandon-cost rule already captures "that character's cost", and persists with the stack item: it holds after the character has left play, including a figment that ceased to exist (0●). An equal cost does not qualify. The deck cards compare by their copiable cost.

Reclaim 3● replaces only the card's ● cost, so a Reclaim play still pays the abandon and captures its cost the same way, and the reclaimed event is banished as it leaves the stack.

The encoding is `additionalCost(abandonCostCapture())`, the effect `materialize(randomIn("deck", 1, { cardType: "character" }, { costGreaterThan: x() }))`, and `reclaim(energy(3))`. The captured cost is the item's X, read once as the effect resolves. Neither the prototype nor the read-only Rust reference implements the card or the comparison (no precedent at steps 2–3), and MTG's Diabolic Intent analog has no comparison to borrow (step 4). The wording problem is logged as a card issue.
