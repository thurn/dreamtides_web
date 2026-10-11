# RD-hv-umm2.106-3: "Discover … and put it on top of your deck" shuffles first, then puts the chosen card on top

- Ladder: 4 (MTG Enlightened Tutor, the card's analog: "search your library …, then shuffle and put that card on top"; adapted to Discover's three random looks)
- rules.md: § Keywords and Effects → Discover
- Affects: 3076694f-ffc2-46c9-8e1a-39f3878c73c9
- Why: Putting the card on top before Discover's shuffle would randomize it, contradicting the text. The card never passes through the hand, so it is neither drawn nor announced as discovered into a hand. Only its controller looked at it, so only its controller keeps knowing it on top; the opponent sees a card from that deck put on top of it, and knows from the announced type only that it is a character of that type.

## Encoding

`discover(filter, cost, "deckTop")`: after the private `discover` choice the deck is shuffled (clearing both sides' position knowledge), the card moves to the top through the ordinary zone change, its controller alone learns it there (`showPrivately`), and `cardsPlaced` names it only to that controller. With no matching card nothing moves and the deck is not shuffled.
