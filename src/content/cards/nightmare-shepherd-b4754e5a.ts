import { triggered, onMaterialized } from "../../engine/dsl/triggers";
import { materializeFigments } from "../../engine/effects/primitives";
import monstrosity from "../figments/monstrosity-ec9f97b2";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";

export default card({
  name: "Nightmare Shepherd",
  mtgName: "Blade Splicer",
  id: "b4754e5a-29e6-418c-bdfa-8e0230a21b7b",
  renderedText: "▸Materialized: Materialize a 4✦ monstrosity figment.",
  amplifiedText: "▸Materialized: Materialize a 5✦ monstrosity figment.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 695511784,
  artOwned: false,
  cardNumber: 301,
  art: { x: 0, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (variant) => [triggered(onMaterialized(), materializeFigments(parseFigmentId(monstrosity.id), 1, { spark: variant.amplified ? 5 : 4 }))],
  verifiedText: "lq48qotysu",
});
