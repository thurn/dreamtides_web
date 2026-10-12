import { card } from "../define";
import { enemyCharacter, target } from "../../engine/dsl/builders";
import { onMaterialized, triggered, whenLeavesPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";

export default card({
  name: "Lurking Regent",
  mtgName: "Skyclave Apparition",
  id: "32f3d6f2-43c5-4510-a23e-558769a7a8c9",
  renderedText:
    "▸Materialized: Banish a ≤4● cost enemy.\n\nWhen this character leaves play, the opponent draws a card.",
  amplifiedText:
    "▸Materialized: Banish a ≤5● cost enemy.\n\nWhen this character leaves play, the opponent draws a card.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Removal", "Art Rework", "Art Duplicate", "Art OK", "Art Owned"],
  imageNumber: 425039560,
  artOwned: false,
  cardNumber: 149,
  art: { x: 0.068, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), p.banish(target(enemyCharacter({ costAtMost: variant.amplified ? 5 : 4 })))),
    triggered(whenLeavesPlay(), p.draw(1, "opponent")),
  ],
  verifiedText: "amotb47erk",
});
