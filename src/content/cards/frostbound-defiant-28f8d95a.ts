import { abandonSelfCost, activated, fromVoid } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Frostbound Defiant",
  mtgName: "Conjurer's Bauble",
  id: "28f8d95a-be99-4b4c-b9ef-92a4b40fffe7",
  renderedText:
    "Abandon this character: Shuffle up to 3 cards from your void into your deck. Draw a card.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "tutorial"],
  imageNumber: 499788403,
  artOwned: false,
  cardNumber: 54,
  art: { x: -0.39, y: -0.308, scale: 1.87 },
  isStarter: false,
  abilities: () => [
    activated([abandonSelfCost()], p.sequence(p.shuffleInto([fromVoid({}, { count: 3, upTo: true })]), p.draw(1))),
  ],
  verifiedText: "eczdib99k8",
});
