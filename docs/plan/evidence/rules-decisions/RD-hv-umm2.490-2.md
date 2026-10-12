# RD-hv-umm2.490-2: "Banish a card from your void" as a void ability's cost may banish the ability's own card

- Ladder: 5 (simplest reading consistent with every affected card text), with the MTG analog (a cost "exile a card from your graveyard" on a graveyard ability may exile the object itself; MTG 400.7 makes the effect then do nothing to it).
- rules.md: § Ability Types → Where activated abilities work.
- Affects: fd355778-abea-4513-844c-91bf75929ebe (Immortal Reaper, "2●, Banish a card from your void: Materialize this character from your void.").
- Why: the printed cost says "a card", not "another card"; card text elsewhere says "another" when it excludes the source. Excluding it would add an unprinted restriction. Banishing the Reaper itself pays the cost and leaves the ability nothing to materialize, which is a legal but pointless choice; it needs no special rule beyond "this character" naming the card in your void as the ability resolves.
- Mechanics: no code path: `banishFromVoid` cost candidates are every matching card in the payer's void, and `materialize(thisCardIn("void"))` finds nothing once the card has left the void.
- Contracts: `activated-from-void.contracts.ts` ("pays energy and a banished void card, its own card included").
