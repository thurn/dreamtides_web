import { conditionCardCounts, self, staticAbility } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Angel of Memory",
  mtgName: "Elvish Reclaimer",
  id: "86881031-393f-4359-96f5-3adde6bdd74d",
  renderedText:
    "This character has +4✦ if there are three or more ≤2● cost characters in your void.",
  amplifiedText:
    "This character has +4✦ if there are two or more ≤2● cost characters in your void.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 682942729,
  artOwned: true,
  cardNumber: 66,
  art: { x: 0, y: 0.7, scale: 1.3 },
  isStarter: false,
  abilities: (variant) => [
    staticAbility(p.sparkModifier(self(), 4), {
      while: conditionCardCounts("void", variant.amplified ? 2 : 3, { filter: { cardType: "character", costAtMost: 2 } }),
    }),
  ],
  verifiedText: "hmu4xm3f7z",
});
