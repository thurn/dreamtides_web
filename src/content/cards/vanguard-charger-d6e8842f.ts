import { activated, characterYouControl, count, exhaustSelf, ofSubtype, target } from "../../engine/dsl/builders";
import { untilEndOfTurn, untilYourNextTurn } from "../../engine/dsl/triggers";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Vanguard Charger",
  mtgName: "Michiko's Reign of Truth // Portrait of Michiko",
  id: "d6e8842f-c0a4-4b4c-93bd-377cfae60894",
  renderedText:
    "❖ – ☾: Give a character you control +1✦ for each warrior you control until end of turn.",
  amplifiedText:
    "❖ – ☾: Give a character you control +1✦ for each warrior you control until the start of your next turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "Ally Audit", "tutorial", "Art Owned"],
  imageNumber: 1788833078,
  artOwned: true,
  cardNumber: 202,
  art: { x: 0, y: -0.345, scale: 1.81 },
  isStarter: false,
  abilities: (variant) => [
    activated([exhaustSelf()], gainSpark(
      target(characterYouControl()),
      count(characterYouControl(ofSubtype("Warrior"))),
      variant.amplified ? untilYourNextTurn() : untilEndOfTurn(),
    ), { speed: "fast" }),
  ],
  verifiedText: "2lcbt5sim4",
});
