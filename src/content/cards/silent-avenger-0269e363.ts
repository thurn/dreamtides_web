import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Silent Avenger",
  mtgName: "Accursed Marauder",
  id: "0269e363-5567-47a4-80cd-8ebc061fe7e1",
  renderedText: "▸Materialized: Each player abandons a non-figment character.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2025883229,
  artOwned: false,
  cardNumber: 234,
  art: { x: 0.782, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [triggered(onMaterialized(), p.eachPlayer(p.abandon("you", { figment: false })))],
  verifiedText: "128zd7w1mqi",
});
