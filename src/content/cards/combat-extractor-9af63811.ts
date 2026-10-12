import { activated, characterYouControl, discardCostFilter, enemyCharacter, energy, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Combat Extractor",
  mtgName: "Living Twister",
  id: "9af63811-7fef-4e28-b672-95ea82796f45",
  renderedText:
    "2●, Discard a character: Dissolve a ≤2✦ enemy.\n\n1●: Return a character you control to hand.",
  amplifiedText:
    "2●, Discard a character: Dissolve a ≤3✦ enemy.\n\n1●: Return a character you control to hand.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Removal", "Art Rework", "Ally Audit", "Art OK", "tutorial"],
  imageNumber: 1694993299,
  artOwned: false,
  cardNumber: 328,
  art: { x: -0.1, y: -0.348, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [
    activated([energy(2), discardCostFilter({ cardType: "character" })], p.dissolve(target(enemyCharacter({ sparkAtMost: variant.amplified ? 3 : 2 })))),
    activated([energy(1)], p.returnToHand(target(characterYouControl()))),
  ],
  verifiedText: "2gj0vrw6yr0",
});
