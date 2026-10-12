import { activated, energy, self } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { foresee, move } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Cloud Drifter",
  mtgName: "Faerie Seer",
  id: "8cb543d7-e70b-4526-b473-bb17dcaee2a7",
  renderedText:
    "▸Materialized: Foresee 2.\n\n❖ – 1●: Move this character to an unoccupied character position.",
  amplifiedText:
    "▸Materialized: Foresee 3.\n\n❖ – 1●: Move this character to an unoccupied character position.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 316023017,
  artOwned: false,
  cardNumber: 359,
  art: { x: -0.07, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), foresee(variant.amplified ? 3 : 2)),
    activated([energy(1)], move(self()), { speed: "fast" }),
  ],
  verifiedText: "4ahaj6xamk",
});
