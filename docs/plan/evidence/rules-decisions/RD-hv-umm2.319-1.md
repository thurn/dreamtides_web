# RD-hv-umm2.319-1: A chosen discard triggers the hand holder's discard abilities

- Ladder: 4, applying the discard attribution settled by RD-hv-umm2.116-1 and the normative "When you discard" rule. The existing rule settles this case without another ambiguity decision.
- rules.md: § Zones → Hand → Chosen discard and When you discard.
- Affects: ca0e9275-7fbe-47ce-b776-da5b2607145e, 13c45db4-ebab-4364-a14a-59a2e9c52bb5, 6475483c-07de-43a0-b419-aaae6f436ec6; every "When you discard a card" ability, including 9a18d375-1b6d-4df4-95ec-c7c5c3f36379.
- Why: The effect controller chooses which opponent-held card leaves that hand (RD-hv-umm2.57-1). The hand holder performs the discard, even when another player owns the card. The holder's discard abilities trigger; choosing a card does not fire the chooser's own discard abilities. The card enters its owner's void, a separate zone destination rule. Synthetic contracts cover both effect controllers, both players' listeners, and a chosen card owned by the chooser.
- Runtime: The primitive uses the shared discard transition with the hand holder as `discarded.side`; the trigger matcher compares that side with its listener's resolved player. Existing UUID event logs identify the discard and the queued and resolved listener.
