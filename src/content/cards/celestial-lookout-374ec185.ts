import { card } from "../define";
import { activated, countersXCost, randomIn, x } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { materialize, storeCounters } from "../../engine/effects/primitives";

export default card({
  name: "Celestial Lookout",
  mtgName: "Lonis, Cryptozoologist",
  id: "374ec185-b0f7-40e6-9988-09e96abccebe",
  renderedText:
    "When you play a character, store 1⧗.\n\nX⧗: Materialize a random character with cost X● from the opponent's deck.",
  amplifiedText:
    "When you play a character, store 2⧗.\n\nX⧗: Materialize a random character with cost X● from the opponent's deck.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Tinkerer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Free Sacrifice", "Figment Maker", "Character Payoff"],
  imageNumber: 515170852,
  artOwned: false,
  cardNumber: 392,
  art: { x: 0.671, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    triggered(whenYouPlay({ cardType: "character" }), storeCounters(variant.amplified ? 2 : 1)),
    activated([countersXCost(0)], materialize(randomIn("deck", 1, { cardType: "character" }, { player: "opponent", costExactly: x() }))),
  ],
  verifiedText: "sy6uqb3pm4",
});
