import { activated, countersCost, self } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Surge Evoker",
  mtgName: "Thing in the Ice // Awoken Horror",
  id: "8d35aec1-29ad-432c-9c23-25a52804cbae",
  renderedText:
    "When you play an event, store 1⧗.\n\n3⧗: This character gains +5✦.",
  amplifiedText:
    "When you play an event, store 2⧗.\n\n3⧗: This character gains +5✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Event Payoff", "Art Rework", "Art OK"],
  imageNumber: 533945362,
  artOwned: false,
  cardNumber: 41,
  art: { x: 0.681, y: 0.126, scale: 1.8 },
  isStarter: false,
  abilities: (variant) => [
    triggered(whenYouPlay({ cardType: "event" }), p.storeCounters(variant.amplified ? 2 : 1)),
    activated([countersCost(3)], p.gainSpark(self(), 5)),
  ],
  verifiedText: "zfp2befnro",
});
