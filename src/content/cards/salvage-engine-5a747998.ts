import { activated, discardCost, self } from "../../engine/dsl/builders";
import { untilEndOfTurn } from "../../engine/dsl/triggers";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Salvage Engine",
  mtgName: "Oona's Prowler",
  id: "5a747998-7219-4e23-be42-b8cb3be12348",
  renderedText: "Discard a card: This character gains +2✦ until end of turn.",
  amplifiedText: "Discard a card: This character gains +3✦ until end of turn.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 1570031572,
  artOwned: false,
  cardNumber: 73,
  art: { x: 0, y: 0.424, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [activated([discardCost()], gainSpark(self(), variant.amplified ? 3 : 2, untilEndOfTurn()))],
  verifiedText: "9zz4bv2ryv",
});
