import { triggered, whenDiscard } from "../../engine/dsl/triggers";
import { draw, gainEnergy, sequence } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "Thought Augury",
  mtgName: "Monument to Endurance",
  id: "b4838d67-f055-4fd3-a64d-0a4d2b6678cc",
  renderedText:
    "Once per turn, when you discard a card, draw a card and gain 1●.",
  amplifiedText:
    "Once per turn, when you discard a card, draw a card and gain 2●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2155438711,
  artOwned: true,
  cardNumber: 256,
  art: { x: -0.002, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (variant) => [triggered(whenDiscard(), sequence(draw(1), gainEnergy(variant.amplified ? 2 : 1)), { oncePerTurn: true })],
  verifiedText: expectedVerifiedText("Once per turn, when you discard a card, draw a card and gain 1●.", "Once per turn, when you discard a card, draw a card and gain 2●."),
});
