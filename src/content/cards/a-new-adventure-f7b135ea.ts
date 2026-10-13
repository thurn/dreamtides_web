import { event } from "../../engine/dsl/builders";
import { discard, draw, gainEnergy, sequence } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "A New Adventure",
  mtgName: "Frantic Search",
  id: "f7b135ea-4894-46ab-b41d-ba2f74b070a1",
  renderedText: "Draw two cards, then discard two cards. Gain 3●.",
  amplifiedText: "Draw two cards, then discard one card. Gain 3●.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art OK", "Art Owned"],
  imageNumber: 1728839131,
  artOwned: false,
  cardNumber: 447,
  isStarter: false,
  abilities: (variant) => [event(sequence(draw(2), discard(variant.amplified ? 1 : 2), gainEnergy(3)))],
  verifiedText: expectedVerifiedText("Draw two cards, then discard two cards. Gain 3●.", "Draw two cards, then discard one card. Gain 3●."),
});
