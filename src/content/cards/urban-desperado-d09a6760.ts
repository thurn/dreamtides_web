import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Urban Desperado",
  mtgName: "Ranger-Captain of Eos",
  id: "d09a6760-6630-4964-9c77-decc641df713",
  renderedText: "▸Materialized: The opponent cannot play events this turn.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 653553988,
  artOwned: false,
  cardNumber: 295,
  isStarter: false,
  abilities: () => [triggered(onMaterialized(), p.cannotPlay("opponent", { cardType: "event" }, { duration: "untilEndOfTurn" }))],
  verifiedText: "2f14vbr4lke",
});
