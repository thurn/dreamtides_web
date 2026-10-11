# RD-hv-umm2.57-1: Chosen opponent-hand discard belongs to the effect controller

- Ladder: 5 (simplest reading consistent with each affected printed text).
- rules.md: § Zones → Hand → Chosen discard.
- Affects: ca0e9275-7fbe-47ce-b776-da5b2607145e, 13c45db4-ebab-4364-a14a-59a2e9c52bb5, 6475483c-07de-43a0-b419-aaae6f436ec6.
- Why: Each instruction tells the effect controller to discard a chosen opponent hand card. The controller makes the choice during resolution; the opponent holds the cards being discarded. Showing eligible cards privately gives the chooser enough information to select while preserving deck secrecy and the printed restriction. An empty eligible set performs no discard. Public void entry uses the hand-zone visibility rule.
- Clarifications: None of C1–C17 names these entities. Reclaim follows the existing keyword rule without a new decision.
