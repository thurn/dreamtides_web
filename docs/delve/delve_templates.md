# Delve Event Effects

At a Delve site, the game randomly selects one card from the player's deck as the narrative focus. The player does not draw or remove that card. Instead, they delve into it and experience a short narrative event with two choices. The event is tied thematically to the character or event displayed on the card and is often also mechanically connected to the card's abilities. For example, a Warrior card might offer choices that benefit a Warriors deck.

Each card in `data/tabula/cards.toml` has a preconfigured narrative event description and two choice effects. Each choice uses exactly one of the effect templates below.

We are currently designing these effects.

## Template Variables

Variables written as `{variable_name}` are values chosen by the effect designer to fit the event's narrative and game-design goals. For example, `Gain {card_id}` means that the designer should select an appropriate card from `data/tabula/cards.toml` by UUID. The card's name is displayed to the player. Similarly, the designer might apply `Purge up to {count} chosen {predicate} cards` as `Purge up to 4 chosen events`; that completed text is what the player sees.

A `{predicate}` is any rule that selects or classifies cards, such as card type, subtype, cost, spark, effect, legendary status, or starter status.

The templates also use these special variables, which are resolved when the event is generated and displayed as part of the choice text:

- `$OFFERED_CARD` is a random card offered from the card pool. The designer may specify a predicate that controls which cards are eligible.
- `$DECK_CARD` is a random card selected from the player's current deck. The designer may specify a predicate that controls which cards are eligible.
- `$STARTER_CARD` is a random starter card selected from the player's current deck.
- `$CUSTOM_CARD` is a custom card designed for this specific event.
- `$CUSTOM_DREAMSIGN` is a new dreamsign designed for this specific event.

For example, `Apply a transfiguration to $DECK_CARD` might select a Warrior card from the player's deck, if one is present. If the selected card is Aspiring Guardian, the choice text displayed to the player would be `Apply a transfiguration to Aspiring Guardian`.

Record the selection predicate for any special card variable in the output JSON's optional `notes` field. For `$CUSTOM_CARD`, use `notes` to describe its UUID, cost, type, subtype, abilities, and spark. For `$CUSTOM_DREAMSIGN`, use `notes` to describe the dreamsign and its effect.

## Effect Templates

1. Gain {essence} essence
2. Gain a random amount of essence between {essence1} and {essence2}
3. Purge a chosen card
4. Purge a chosen {predicate} card
5. Purge up to {count} chosen cards
6. Purge up to {count} chosen {predicate} cards
7. Purge a chosen {predicate} card and gain a random {predicate} replacement
8. Purge up to {count} chosen {predicate} cards and gain a random {predicate} replacement for each card purged
9. Gain a random {predicate} card
10. Gain {card_id}
11. Gain $OFFERED_CARD
12. Gain {count} copies of $OFFERED_CARD
13. Gain {count} random {predicate} cards
14. Draft a {predicate} card from 4 random choices
15. Draft a {predicate} card from 4 random choices and gain {count} copies of it
16. Take any number of {predicate} cards from 4 random choices
17. Apply a transfiguration of your choice to a chosen card
18. Apply {transfiguration} to a chosen card
19. Apply {transfiguration} to $DECK_CARD
20. Apply a transfiguration to {count} chosen {predicate} cards
21. Apply {transfiguration} to {count} chosen {predicate} cards
22. Apply a transfiguration to {count} random {predicate} cards
23. Apply {transfiguration} to {count} random {predicate} cards
24. Transfigure {count} random starter cards
25. Transfigure all starter cards
26. Gain $CUSTOM_CARD
27. Gain {dreamsign_name}
28. Gain a random dreamsign
29. Gain one of 3 offered dreamsigns
30. Replace a chosen dreamsign with one of 3 offered dreamsigns
31. Gain $CUSTOM_DREAMSIGN
32. Purge $STARTER_CARD
33. Purge a random starter card
34. Purge a random starter card and gain a {predicate} card
35. Purge all starter cards and replace each one with a {predicate} card
36. Choose one of 2 packs of {predicate} cards to add to your deck
37. The next draft or shop site you visit will contain transfigured cards
38. Draw {count} additional cards at the start of your next battle
39. Gain {count} additional energy at the start of your next battle
40. Transfigure all cards in your deck
41. Add a duplication site to this dreamscape
42. Add a card market site to this dreamscape
43. Add a dreamsign bazaar site to this dreamscape
44. Add a transfiguration site to this dreamscape
45. Add a purge site to this dreamscape.
46. Choose one of three site types to add to this dreamscape.
47. Choose a card to purge and replace it with {card_id}
48. Purge a random {predicate} card and replace it with {card_id}
49. Gain {count} copies of $DECK_CARD
50. Gain {count} copies of a chosen card
51. Gain one copy of each of {count} chosen cards
52. Gain one copy of each of {count} random {predicate} cards
53. Change $DECK_CARD to become a {card_type}
54. Modify {count} random cards to become {card_type} cards
55. Select 4 random cards from your deck and choose one to gain a copy of
56. All items in the next shop you visit are free
57. Pick a new Dream Avatar from 3 choices
58. Change a chosen Character card to have {subtype}
59. Gain {essence_per_card} essence for each {predicate} card in your deck
60. Purge a chosen card and gain {essence_per_energy} essence for each ✦ it had
61. Purge a chosen card and gain a copy of another chosen card
62. Purge a chosen dreamsign and gain {essence} essence
63. Replace all of your dreamsigns with random dreamsigns
64. All characters in your deck gain +1✦
65. All cards in your deck are reduced in cost by 1●. Gain {count} "Nightmare" bane cards.
66. All cards in your deck become ❖ (fast)
67. All characters in your deck become the subtype of your choice.
68. Double your current essence.
69. Gain {count} "Nightmare" bane cards. Gain {dreamsign}.
70. Gain {count} "Nightmare" bane cards. Gain {card_name}.
71. Gain {count} "Nightmare" bane cards. Gain one of 3 offered dreamsigns.
72. Gain a random legendary card.