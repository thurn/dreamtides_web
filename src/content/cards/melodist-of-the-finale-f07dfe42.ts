import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenYouChallengeWith } from "../../engine/dsl/triggers";
import { draw } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Melodist of the Finale",
  mtgName: "Losheel, Clockwork Scholar",
  id: "f07dfe42-566c-4e91-a250-9e2781e9d06f",
  renderedText: "When you challenge with two or more warriors, draw a card.",
  amplifiedText: "When you challenge with two or more warriors, draw 2 cards.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Musician",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["Art Rework", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 1074373424,
  artOwned: false,
  cardNumber: 406,
  isStarter: false,
  // C10 and RD-hv-7x4l.1-15: count designated Warriors once, at the end of Day.
  abilities: (variant) => [triggered(whenYouChallengeWith(2, characterYouControl({ subtype: "Warrior" })), draw(variant.amplified ? 2 : 1))],
  verifiedText: "2gjbremzmbn",
});
