import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import legionnaire from "../figments/legionnaire-e757b306";

export default card({
  name: "Sky Legion Captain",
  mtgName: "Digsite Engineer",
  id: "3fab0780-59d4-45f1-8aac-a870ad8729ac",
  renderedText:
    "When you play a warrior, you may pay 2● to materialize a Legionnaire figment.",
  amplifiedText:
    "When you play a warrior, you may pay 2● to materialize a 2✦ Legionnaire figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [
    "Spark Scaler",
    "Art Rework",
    "Art Duplicate",
    "Art OK",
    "tutorial",
    "Art Owned",
  ],
  imageNumber: 2023111781,
  artOwned: false,
  cardNumber: 362,
  art: { x: 0.092, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (v) => [
    triggered(
      whenYouPlay({ subtype: "Warrior" }),
      p.payTo({ energy: 2 }, p.materializeFigments(parseFigmentId(legionnaire.id), 1, v.amplified ? { spark: 2 } : {})),
    ),
  ],
  verifiedText: "xohhd5z6iv",
});
