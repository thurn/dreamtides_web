import { enemyCharacter, event, fromVoid, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Return to Nowhere",
  mtgName: "Prismari Command",
  id: "e3431bd0-5a81-497f-9ec9-18275b568c00",
  renderedText:
    "Choose one: Dissolve a ≤2✦ enemy, draw 2 cards and discard 2 cards, or return a ≤2● cost character from your void to hand.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Removal", "tutorial", "Art Owned"],
  imageNumber: 1149594743,
  artOwned: false,
  cardNumber: 96,
  art: { x: 0, y: 0, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    event(p.chooseOne(
      p.dissolve(target(enemyCharacter({ sparkAtMost: 2 }))),
      p.sequence(p.draw(2), p.discard(2)),
      p.returnFromVoid(fromVoid({ cardType: "character", costAtMost: 2 })),
    )),
  ],
  verifiedText: "1fqwo4q0f0d",

});
