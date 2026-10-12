import { self } from "../../engine/dsl/builders";
import { onChallenge, triggered } from "../../engine/dsl/triggers";
import { gainSpark, payTo } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Aerie Defender",
  mtgName: "Inti, Seneschal of the Sun",
  id: "c11eb833-a45b-4983-949d-848039d0504c",
  renderedText:
    "▸Challenge: You may discard a card to give this character +2✦.",
  amplifiedText:
    "▸Challenge: You may discard a card to give this character +4✦.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art Duplicate", "Art OK", "Art Owned"],
  imageNumber: 1159163608,
  artOwned: false,
  cardNumber: 455,
  art: { x: -0.318, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [triggered(onChallenge(), payTo({ discard: 1 }, gainSpark(self(), variant.amplified ? 4 : 2)))],
  verifiedText: "21bp8ew5eer",
});
