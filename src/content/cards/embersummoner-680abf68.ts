import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import { materializeFigments } from "../../engine/effects/primitives";
import ethereal from "../figments/ethereal-3eddb1b8";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";

export default card({
  name: "Embersummoner",
  mtgName: "Chatterfang, Squirrel General",
  id: "680abf68-d7bb-47cf-885a-d808dc0a8e09",
  renderedText:
    "When you materialize a figment, materialize a 1✦ ethereal figment.",
  amplifiedText:
    "When you materialize a figment, materialize a 2✦ ethereal figment.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Figment Maker"],
  imageNumber: 730423177,
  artOwned: false,
  cardNumber: 431,
  art: { x: -0.753, y: 1, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [triggered(whenMaterialize(characterYouControl({ figment: true })), materializeFigments(parseFigmentId(ethereal.id), 1, { spark: variant.amplified ? 2 : 1 }))],
  verifiedText: "hp0rvtlwbs",
});
