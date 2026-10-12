import { abandonCost, activated, energy, exhaustSelf, fromVoid } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { returnFromVoid } from "../../engine/effects/primitives/return-from-void";
import { card } from "../define";

export default card({
  name: "Remnant Curator",
  mtgName: "Living Twister",
  id: "ce0c8dc8-67ab-4a1f-8c4c-50b211e07b0b",
  renderedText:
    "1●: Return a ≤2● cost character from your void to your hand.\n\n1●, ☾, Abandon a character: Draw a card.",
  amplifiedText:
    "1●: Return a ≤3● cost character from your void to your hand.\n\n1●, ☾, Abandon a character: Draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1727859046,
  artOwned: false,
  cardNumber: 327,
  art: { x: -0.049, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    activated([energy(1)], returnFromVoid(fromVoid({ cardType: "character", costAtMost: variant.amplified ? 3 : 2 }))),
    activated([energy(1), exhaustSelf(), abandonCost()], p.draw(1)),
  ],
  verifiedText: "2blidjdrwap",
});
