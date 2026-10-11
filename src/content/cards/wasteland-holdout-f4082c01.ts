import { activated, characterYouControl, countersCost, exhaustSelf } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Wasteland Holdout",
  mtgName: "Staff of the Storyteller",
  id: "f4082c01-fdc8-4583-afdb-76bac980b3bf",
  renderedText:
    "When you materialize a figment, store 1⧗.\n\n1⧗, ☾: Draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 2590831715,
  artOwned: false,
  cardNumber: 36,
  art: { x: 0, y: -0.51, scale: 1.47 },
  isStarter: false,
  abilities: () => [
    triggered(whenMaterialize(characterYouControl({ figment: true })), p.storeCounters(1)),
    activated([countersCost(1), exhaustSelf()], p.draw(1)),
  ],
  verifiedText: "1nmh43mgnkz",
});
