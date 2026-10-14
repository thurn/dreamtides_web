import { card } from "../define";
import { abandonCost, activated, countersXCost, enemyCharacter, target, x } from "../../engine/dsl/builders";
import { dissolve, storeCounters } from "../../engine/effects/primitives";

export default card({
  name: "Eviscerator of Hope",
  mtgName: "Goblin Bombardment",
  id: "f3f97e2c-3bb6-4a20-9880-f59c50e5af93",
  renderedText:
    "Abandon a character: Store 1⧗.\n\nX⧗: Dissolve an enemy with X✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Removal", "Storage Removal", "Art Rework", "Art OK"],
  imageNumber: 1026869440,
  artOwned: false,
  cardNumber: 79,
  art: { x: 0.462, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: () => [activated([abandonCost()], storeCounters(1)), activated([countersXCost(0)], dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }))))],
  verifiedText: "lcn53gf5lm",
});
