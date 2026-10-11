import { triggered, whenDiscard } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Pattern Seeker",
  mtgName: "Inti, Seneschal of the Sun",
  id: "9a18d375-1b6d-4df4-95ec-c7c5c3f36379",
  renderedText: "When you discard a card, draw a card with ephemeral.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Child",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Owned"],
  imageNumber: 2415692463,
  artOwned: true,
  cardNumber: 456,
  art: { x: 0.042, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenDiscard(), p.draw(1, "you", { ephemeral: true }))],
  verifiedText: "2ddr2vwkmq7",
});
