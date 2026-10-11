import { activated, discardCostFilter, energy, keyword, x } from "../../engine/dsl/builders";
import { discover } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Curio Dealer",
  mtgName: "Survival of the Fittest",
  id: "4f0f0811-1a4c-4d42-a804-77dba8707792",
  renderedText:
    "Veil\n\n1●, Discard a character with cost X●: Discover a character with cost X●.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Tinkerer",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: [],
  imageNumber: 454095535,
  artOwned: false,
  cardNumber: 37,
  art: { x: 0, y: -0.681, scale: 1.77 },
  isStarter: false,
  abilities: () => [keyword("veil"), activated([energy(1), discardCostFilter({ cardType: "character" }, { captureCost: true })], discover({ cardType: "character" }, { costExactly: x() }))],
  verifiedText: "pn5ed3689o",
});
