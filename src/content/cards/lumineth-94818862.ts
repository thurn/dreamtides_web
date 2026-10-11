import { activated, discardCostFilter, exhaustSelf, plus, x } from "../../engine/dsl/builders";
import { discover } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Lumineth",
  mtgName: "Fauna Shaman",
  id: "94818862-2875-4ee1-8f72-7c0cdc624202",
  renderedText:
    "☾, Discard a character: Discover a character with cost 1● higher.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Discover", "Art Owned"],
  imageNumber: 2027158304,
  artOwned: false,
  cardNumber: 371,
  art: { x: 0.252, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [activated([exhaustSelf(), discardCostFilter({ cardType: "character" }, { captureCost: true })], discover({ cardType: "character" }, { costExactly: plus(x(), 1) }))],
  verifiedText: "s86vhqsz8p",
});
