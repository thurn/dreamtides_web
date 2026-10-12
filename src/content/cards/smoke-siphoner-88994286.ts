import { self } from "../../engine/dsl/builders";
import { onChallenge, triggered, whenDiscard } from "../../engine/dsl/triggers";
import { draw, gainSpark, payTo } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Smoke Siphoner",
  mtgName: "Conspiracy Theorist",
  id: "88994286-96db-4ba6-a660-b30ae9b52cff",
  renderedText:
    "▸Challenge: You may discard a card to draw a card.\n\nWhen you discard a card, this character gains +2✦ until end of turn.",
  amplifiedText:
    "▸Challenge: You may discard a card to draw a card.\n\nWhen you discard a card, this character gains +3✦ until end of turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 695511787,
  artOwned: true,
  cardNumber: 169,
  art: { x: -0.189, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onChallenge(), payTo({ discard: 1 }, draw(1))),
    triggered(whenDiscard(), gainSpark(self(), variant.amplified ? 3 : 2, "untilEndOfTurn")),
  ],
  verifiedText: "5er3yt6bri",
});
