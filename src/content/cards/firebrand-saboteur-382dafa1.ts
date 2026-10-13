import { conditionCardCounts } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { discard, draw, ifThen } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Firebrand Saboteur",
  mtgName: "Refurbished Familiar",
  id: "382dafa1-f8ff-47b4-9151-15b84067a5b2",
  renderedText:
    "▸Materialized: The opponent discards a card. If they can't, draw a card.",
  amplifiedText:
    "▸Materialized: The opponent discards a card. If they can't, draw 2 cards.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 670293463,
  artOwned: false,
  cardNumber: 352,
  art: { x: 0, y: -0.352, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [
    // Choose the branch before discarding, including when the opponent has exactly one card.
    triggered(onMaterialized(), ifThen(conditionCardCounts("hand", 1, { player: "opponent" }), discard(1, "opponent"), draw(variant.amplified ? 2 : 1))),
  ],
  verifiedText: "1kxobe7xe5u",
});
