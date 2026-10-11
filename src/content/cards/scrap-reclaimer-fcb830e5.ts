import { cardsMovedBy, conditionCardCounts, costOf } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Scrap Reclaimer",
  mtgName: "Formidable Speaker",
  id: "fcb830e5-85ff-48f3-be1e-46e102a5c8e8",
  renderedText:
    "▸Materialized: You may discard a card to discover a character with cost greater than that card's cost.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Tinkerer",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 2269064817,
  artOwned: false,
  cardNumber: 185,
  isStarter: false,
  abilities: () => {
    const payment = p.discard(1);
    const discovery = p.discover({ cardType: "character" }, { costGreaterThan: costOf(cardsMovedBy(payment)) });
    return [triggered(onMaterialized(), p.ifThen(conditionCardCounts("hand", 1), p.optional(p.sequence(payment, discovery))))];
  },
  verifiedText: "29mwwv7ru0",
});
