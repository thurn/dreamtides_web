import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { foresee } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Oracle of Shifting Skies",
  mtgName: "Dragon's Rage Channeler",
  id: "e455225f-c444-44a2-8796-805cae2b755f",
  renderedText: "When you play an event, foresee 1.",
  amplifiedText: "When you play an event, foresee 2.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Visionary",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Event Payoff", "Art Owned"],
  imageNumber: 1963305277,
  artOwned: false,
  cardNumber: 27,
  art: { x: 0.546, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [triggered(whenYouPlay({ cardType: "event" }), foresee(variant.amplified ? 2 : 1))],
  verifiedText: "18x8j0ntcq7",
});
