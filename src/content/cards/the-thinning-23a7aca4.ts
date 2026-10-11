import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Thinning",
  mtgName: "Dreams of Steel and Oil",
  id: "23a7aca4-3c64-4963-a9a0-d3638822df48",
  renderedText: "Banish a chosen character from the opponent's hand.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Thoughtseize"],
  imageNumber: 1492489850,
  artOwned: false,
  cardNumber: 174,
  isStarter: false,
  abilities: () => [event(p.banishChosen({ cardType: "character" }))],
  verifiedText: "a3fkjjdmp1",
});
