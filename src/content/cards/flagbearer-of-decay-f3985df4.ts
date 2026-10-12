import { triggered, whenLeavesVoid } from "../../engine/dsl/triggers";
import { materializeFigments } from "../../engine/effects/primitives";
import shadow from "../figments/shadow-86125402";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";

export default card({
  name: "Flagbearer of Decay",
  mtgName: "Insidious Roots",
  id: "f3985df4-0867-4fd6-8312-6b358dc26883",
  renderedText:
    "When a character card leaves your void, materialize a 2✦ shadow figment.",
  amplifiedText:
    "When a character card leaves your void, materialize a 3✦ shadow figment.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2197688373,
  artOwned: false,
  cardNumber: 112,
  art: { x: -0.16, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (variant) => [triggered(whenLeavesVoid("you", { cardType: "character" }), materializeFigments(parseFigmentId(shadow.id), 1, { spark: variant.amplified ? 3 : 2 }))],
  verifiedText: "13tbttn6lqc",
});
