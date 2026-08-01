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
15. Take any number of {predicate} cards from 4 random choices
16. Apply a transfiguration of your choice to a chosen card
17. Apply {transfiguration} to a chosen card
18. Apply {transfiguration} to $DECK_CARD
19. Apply a transfiguration to {count} chosen {predicate} cards
20. Apply {transfiguration} to {count} chosen {predicate} cards
21. Apply a transfiguration to {count} random {predicate} cards
22. Apply {transfiguration} to {count} random {predicate} cards
23. Transfigure {count} random starter cards
24. Transfigure all starter cards
25. Gain $CUSTOM_CARD
26. Gain {dreamsign_name}
27. Gain a random dreamsign
28. Gain one of 3 offered dreamsigns
29. Gain $CUSTOM_DREAMSIGN
30. Purge $STARTER_CARD
31. Purge a random starter card
32. Purge a random starter card and gain a {predicate} card
33. Purge all starter cards and replace each one with a {predicate} card
34. Choose one of 2 packs of {predicate} cards to add to your deck
35. The next draft or shop site you visit will contain transfigured cards
36. Draw {count} additional cards at the start of your next battle
37. Gain {count} additional energy at the start of your next battle
38. Transfigure all cards in your deck
39. Add {site} to this dreamscape
40. Choose a card to purge and replace it with {card_id}
41. Purge a random {predicate} card and replace it with {card_id}
42. Gain {count} copies of $DECK_CARD
43. Gain {count} copies of a chosen card
44. Gain one copy of each of {count} chosen cards
45. Gain one copy of each of {count} random {predicate} cards
46. Change $DECK_CARD to become a {card_type}
47. Modify {count} random cards to become {card_type} cards
48. Select 4 random cards from your deck and choose one to gain a copy of
49. All items in the next shop you visit are free
50. Pick a new Dream Avatar from 3 choices
