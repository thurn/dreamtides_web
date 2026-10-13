import { characterYouControl, fromVoid, triggerSubjectCost } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import { returnFromVoid } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Burning Revenant",
  mtgName: "Scrap Trawler",
  id: "426825c7-7259-41af-ac1c-c042b878d69b",
  renderedText:
    "When a warrior you control is dissolved, return a warrior with lesser cost from your void to hand.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Ally Audit", "tutorial"],
  imageNumber: 2590831713,
  artOwned: false,
  cardNumber: 489,
  art: { x: 0.714, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenDissolved(characterYouControl({ subtype: "Warrior" })), returnFromVoid(fromVoid({ cardType: "character", subtype: "Warrior" }, { costLessThan: triggerSubjectCost() })))],
  verifiedText: "vlg8n7l7ov",
});
