import { all, characterYouControl, ofSubtype } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Assault Leader",
  mtgName: "Steel Overseer",
  id: "742a376f-68db-466a-b087-405188634ba4",
  renderedText: "▸Dawn: Each warrior you control gains +1✦.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Ally Audit", "tutorial", "Art Owned"],
  imageNumber: 1897537156,
  artOwned: true,
  cardNumber: 221,
  art: { x: 0.21, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(onDawn(), gainSpark(all(characterYouControl(ofSubtype("Warrior"))), 1))],
  verifiedText: "w5lgqiwbdu",
});
