import { abandonSelfCost, activated, discardCost, energy, exhaustSelf, fromVoid } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { returnFromVoid } from "../../engine/effects/primitives/return-from-void";
import { card } from "../define";

export default card({
  name: "Chaos Crasher",
  mtgName: "The Underworld Cookbook",
  id: "ed4d5342-0690-40b7-ab48-6b76035466f2",
  renderedText:
    "☾, Discard a card: Erode 2.\n\n4●, Abandon this character: Return a character from your void to your hand.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 626543207,
  artOwned: false,
  cardNumber: 344,
  art: { x: 0.172, y: -0.636, scale: 1.57 },
  isStarter: false,
  abilities: () => [
    activated([exhaustSelf(), discardCost()], p.erode(2)),
    activated([energy(4), abandonSelfCost()], returnFromVoid(fromVoid({ cardType: "character" }))),
  ],
  verifiedText: "1d5drfktk7b",
});
