import { fromVoid, keyword } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import { returnFromVoid } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Cinderblade Legionnaire",
  mtgName: "Junk Diver",
  id: "4b2f044c-0afe-432a-a121-2ea785bb1182",
  renderedText:
    "Vengeful\n\n▸Dissolved: Return another warrior from your void to your hand.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "tutorial"],
  imageNumber: 337161542,
  artOwned: true,
  cardNumber: 369,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [keyword("vengeful"), triggered(onDissolved(), returnFromVoid(fromVoid({ cardType: "character", subtype: "Warrior" }, { another: true }), { toYourHand: true }))],
  verifiedText: "ircvtrjh4w",
});
