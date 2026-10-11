import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Power Within",
  mtgName: "Ponder",
  id: "f4b34207-2ad4-421b-8798-9c20320607ae",
  renderedText:
    "Look at the top 3 cards of your deck. Put one on top of your deck, one on the bottom of your deck, and one into your hand.",
  amplifiedText:
    "Look at the top 4 cards of your deck. Put one on top of your deck, one on the bottom of your deck, and one into your hand. Put the rest into your void.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Cantrips", "tutorial", "Art Owned"],
  imageNumber: 717263302,
  artOwned: false,
  cardNumber: 442,
  art: { x: -0.353, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [
    event(
      v.amplified
        ? p.putFromTop(4, [{ to: "top", count: 1 }, { to: "bottom", count: 1 }, { to: "hand", count: 1 }, { to: "void", count: "rest" }])
        : p.putFromTop(3, [{ to: "top", count: 1 }, { to: "bottom", count: 1 }, { to: "hand", count: 1 }]),
    ),
  ],
  verifiedText: "19v3psojlhn",
});
