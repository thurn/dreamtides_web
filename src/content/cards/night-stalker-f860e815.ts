import { additionalCost, discardCostFilter } from "../../engine/dsl/builders";
import { either, onDawn, onMaterialized, triggered } from "../../engine/dsl/triggers";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Night Stalker",
  mtgName: "Mox Diamond",
  id: "f860e815-3ed9-463d-ac4d-ed8d2778f8ad",
  renderedText:
    "To play this character, discard a character.\n\n▸Materialized, Dawn: Gain 1●.",
  amplifiedText:
    "To play this character, discard a character.\n\n▸Materialized, Dawn: Gain 2●.",
  energyCost: 0,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1129012706,
  artOwned: false,
  cardNumber: 351,
  art: { x: -0.042, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: (variant) => [
    additionalCost(discardCostFilter({ cardType: "character" })),
    triggered(either(onMaterialized(), onDawn()), gainEnergy(variant.amplified ? 2 : 1)),
  ],
  verifiedText: "yy2a6kugb8",
});
