import { enemyCharacter, target } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Flamecaller",
  mtgName: "Loran of the Third Path",
  id: "acbc1ace-4f6d-45a3-8bf5-a560d1c8485b",
  renderedText: "▸Materialized: Banish a ≤2● cost enemy.",
  amplifiedText: "▸Materialized: Banish a ≤3● cost enemy.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Removal", "Art Rework", "Art OK"],
  imageNumber: 1383318395,
  artOwned: false,
  cardNumber: 366,
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), p.banish(target(enemyCharacter({ costAtMost: variant.amplified ? 3 : 2 })))),
  ],
  verifiedText: "1p9r9gomjmw",
});
