import { card } from "../define";
import { activated, countersXCost, enemyCharacter, target, x } from "../../engine/dsl/builders";
import { dissolve, storeCounters } from "../../engine/effects/primitives";
import { triggered, whenAbandon } from "../../engine/dsl/triggers";

export default card({
  name: "Blight Weaver",
  mtgName: "Mayhem Devil",
  id: "a6866438-3632-408d-b464-c10f8a43a5c2",
  renderedText:
    "When you abandon a character, store 1⧗.\n\nX⧗: Dissolve an enemy with X✦.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Removal", "Storage Removal", "Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 436090600,
  artOwned: false,
  cardNumber: 68,
  art: { x: -0.228, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenAbandon("you"), storeCounters(1)), activated([countersXCost(0)], dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }))))],
  verifiedText: "5pbeempk2k",
});
