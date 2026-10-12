import { onChallenge, triggered } from "../../engine/dsl/triggers";
import { discard, draw, sequence } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Catastrophe Broker",
  mtgName: "Anje's Ravager",
  id: "770b21e4-ea6a-4910-8fca-2ec5b8813da1",
  renderedText: "▸Challenge: Discard your hand, then draw 3 cards.",
  amplifiedText: "▸Challenge: Discard your hand, then draw 4 cards.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2675749427,
  artOwned: false,
  cardNumber: 89,
  art: { x: 0, y: 0.15, scale: 1.66 },
  isStarter: false,
  abilities: (variant) => [triggered(onChallenge(), sequence(discard({ value: "handSize", player: "you" }), draw(variant.amplified ? 4 : 3)))],
  verifiedText: "1eumfjdjeo7",
});
