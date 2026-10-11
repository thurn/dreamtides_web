import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Verdant Pioneer",
  mtgName: "Ranger-Captain of Eos",
  id: "ae90a3e1-c650-4f21-83af-de3208151b11",
  renderedText:
    "▸Materialized: Discover a ≤1● cost character and materialize it.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 2597662163,
  artOwned: false,
  cardNumber: 296,
  isStarter: false,
  abilities: () => [triggered(onMaterialized(), p.materialize(p.discover({ cardType: "character", costAtMost: 1 })))],
  verifiedText: "2dert63enqh",
});
