# RD-hv-umm2.140-1: Grounded can choose X = 0 for a legal cost-zero enemy

- Ladder: 1 (rules.md § Costs, Requirements, and X: whether zero is legal depends on a meaningful effect, and cost conditions read copiable cost), then 5 (the simplest reading consistent with the printed target).
- rules.md: § Costs, Requirements, and X → X costs; § Targeting.
- Affects: 7df5255e-bf23-4c14-b31b-be89fb864ee0.
- Why: Banish an enemy with cost X● has a meaningful effect at X = 0 when an enemy has copiable cost zero, including a figment or a card whose deck-entry cost modification makes it zero. A mandatory target still withholds the play without a legal enemy. The existing authoring field xMinimum is zero; paired costAtLeast/costAtMost bounds read the chosen paid X. Price modifiers do not alter a target's copiable cost. The printed X energy orb, Interrupt speed and all canonical card data are preserved.
