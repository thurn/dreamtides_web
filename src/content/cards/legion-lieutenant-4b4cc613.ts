import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import legionnaire from "../figments/legionnaire-e757b306";
import { card } from "../define";

export default card({
  name: "Legion Lieutenant",
  mtgName: "Urza, Lord High Artificer",
  id: "4b4cc613-2e28-4851-975f-14146286a062",
  renderedText: "▸Materialized: Materialize a Legionnaire figment.",
  amplifiedText:
    "▸Materialized: Materialize a Legionnaire figment with awakened.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Spark Scaler", "Art Rework", "Art OK"],
  imageNumber: 735243049,
  artOwned: false,
  cardNumber: 218,
  art: { x: 0.083, y: 1, scale: 1.16 },
  isStarter: false,
  abilities: (variant) => [
    // With awakened is ready at entry, without a persistent keyword grant (RD93-2).
    triggered(onMaterialized(), materializeFigments(parseFigmentId(legionnaire.id), 1, { awakened: variant.amplified })),
  ],
  verifiedText: "15lr0l75uv5",
});
