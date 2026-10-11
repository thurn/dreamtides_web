import { characterYouControl, costExactly, keyword, x } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Lumin-Gate Seer",
  mtgName: "Ineffable Blessing",
  id: "33cf7dca-d8d2-42b7-854a-b3f503b03488",
  renderedText:
    "Veil\n\nWhen you materialize a character with cost X●, draw a card.",
  energyCost: 2,
  energyCosts: ["2", "X"],
  xMinimum: 0,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Owned"],
  imageNumber: 2127752120,
  artOwned: true,
  cardNumber: 487,
  isStarter: false,
  abilities: () => [keyword("veil"), triggered(whenMaterialize(characterYouControl(costExactly(x()))), p.draw(1))],
  verifiedText: "2b1qgk0wic9",
});
