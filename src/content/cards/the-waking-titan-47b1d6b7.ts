import { activated, all, anyCharacter, countersCost } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Waking Titan",
  mtgName: "Thing in the Ice // Awoken Horror",
  id: "47b1d6b7-0388-4bb9-abfc-ed832d902e9f",
  renderedText:
    "When you play an event, store 1⧗.\n\n5⧗: Return all other characters to hand.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["Event Payoff", "Art Owned"],
  imageNumber: 2320845229,
  artOwned: false,
  cardNumber: 40,
  isStarter: false,
  abilities: () => [
    triggered(whenYouPlay({ cardType: "event" }), p.storeCounters(1)),
    activated([countersCost(5)], p.returnToHand(all(anyCharacter({ another: true })))),
  ],
  verifiedText: "28dj20xl3bu",
});
