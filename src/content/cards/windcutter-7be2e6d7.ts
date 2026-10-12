import { card } from "../define";
import { enemyCharacter, target } from "../../engine/dsl/builders";
import { onChallenge, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";

export default card({
  name: "Windcutter",
  mtgName: "Phelia, Exuberant Shepherd",
  id: "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  renderedText: "▸Challenge: Banish an enemy until end of turn.",
  amplifiedText: "▸Challenge: Banish an enemy until your next turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "tutorial"],
  imageNumber: 454095982,
  artOwned: false,
  cardNumber: 1,
  art: { x: -0.426, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [triggered(onChallenge(), p.banishUntil(target(enemyCharacter()), variant.amplified ? "untilYourNextTurn" : "untilEndOfTurn"))],
  verifiedText: "20wwv7t9gcs",
});
