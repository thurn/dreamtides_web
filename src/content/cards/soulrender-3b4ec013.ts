import { activated, discardCostFilter, enemyCharacter, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Soulrender",
  mtgName: "Molten Vortex",
  id: "3b4ec013-0e07-4bf8-9879-5fbe3bf318b2",
  renderedText: "Discard a ≤2● cost character: Dissolve a ≤2● cost enemy.",
  amplifiedText: "Discard a ≤2● cost character: Dissolve a ≤3● cost enemy.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Removal", "Art Rework", "Art Duplicate", "Art OK"],
  imageNumber: 1207264102,
  artOwned: true,
  cardNumber: 235,
  art: { x: -0.368, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (variant) => [
    activated([discardCostFilter({ cardType: "character", costAtMost: 2 })], p.dissolve(target(enemyCharacter({ costAtMost: variant.amplified ? 3 : 2 })))),
  ],
  verifiedText: "1vulc99n5pg",
});
