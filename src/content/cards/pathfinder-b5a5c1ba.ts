import { fromVoid } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import { returnFromVoid } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Pathfinder",
  mtgName: "Myr Retriever",
  id: "b5a5c1ba-4784-4829-aa08-af9f8f41ebb7",
  renderedText:
    "▸Dissolved: Return another warrior from your void to your hand.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["tutorial"],
  imageNumber: 1790126255,
  artOwned: false,
  cardNumber: 404,
  art: { x: 0.783, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(onDissolved(), returnFromVoid(fromVoid({ cardType: "character", subtype: "Warrior" }, { another: true }), { toYourHand: true }))],
  verifiedText: "1ogqyxnik64",
});
