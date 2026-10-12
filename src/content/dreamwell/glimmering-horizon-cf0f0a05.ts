import { conditionCardCounts, event, plus, times } from "../../engine/dsl/builders";
import { draw } from "../../engine/effects/primitives/draw";
import { ifThen } from "../../engine/effects/primitives/if-then";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Glimmering Horizon",
  id: "cf0f0a05-2a94-407c-8c22-e41b925f9c03",
  renderedText:
    "If you have fewer than 2 cards in hand, draw until you have 2 cards in hand.",
  order: 2,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 2419795157,
  artOwned: true,
  cardNumber: 8,
  tags: ["Art Owned"],
  abilities: () => [event(ifThen(conditionCardCounts("hand", 0, { atMost: 1 }), draw(plus(times({ value: "handSize", player: "you" }, -1), 2))))],
  verifiedText: "2apougg3cfx",
});
