import { staticAbility, supported } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { draw, sparkModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Symphonic Muse",
  mtgName: "Ice-Fang Coatl",
  id: "41d0aa36-f15a-487d-b97c-7fd765973921",
  renderedText:
    "▸Materialized: Draw a card.\n\nSupport - Supported characters have +2✦.\n",
  amplifiedText:
    "▸Materialized: Draw a card.\n\nSupport – Supported characters have +3✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Musician",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: 1,
  tags: ["ETB Draw", "Art Rework", "Art OK", "tutorial"],
  imageNumber: 1021646683,
  artOwned: false,
  cardNumber: 338,
  art: { x: -0.084, y: -0.163, scale: 1.27 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), draw(1)),
    staticAbility(sparkModifier(supported(), variant.amplified ? 3 : 2)),
  ],
  verifiedText: "y3xs8svv8j",
});
