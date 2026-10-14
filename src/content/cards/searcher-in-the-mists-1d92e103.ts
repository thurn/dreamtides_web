import { either, onDissolved, onMaterialized, triggered } from "../../engine/dsl/triggers";
import { erode } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Searcher in the Mists",
  mtgName: "Stitcher's Supplier",
  id: "1d92e103-8415-433d-97d6-ac8a83660b34",
  renderedText: "▸Materialized, Dissolved: Erode 4.",
  amplifiedText: "▸Materialized, Dissolved: Erode 5.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: [],
  imageNumber: 1971751580,
  artOwned: false,
  cardNumber: 477,
  art: { x: -0.546, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [triggered(either(onMaterialized(), onDissolved()), erode(variant.amplified ? 5 : 4))],
  verifiedText: "38zg6s240h",
});
