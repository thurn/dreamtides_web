import { onMaterialized, triggered, triggeringCard, whenYouPlay } from "../../engine/dsl/triggers";
import { createCopyInHand, delayed, modifyCardCost } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Ringleader",
  mtgName: "Dualcaster Mage",
  id: "4cec92f2-9bac-4949-a602-cd0a44618aaf",
  renderedText:
    "▸Materialized: The next time you play an event this turn, create a 0● ephemeral copy of that event in your hand.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Owned"],
  imageNumber: 1005938035,
  artOwned: false,
  cardNumber: 261,
  art: { x: 0, y: -0.627, scale: 1.57 },
  isStarter: false,
  abilities: () => [
    triggered(onMaterialized(), delayed(
      whenYouPlay({ cardType: "event" }),
      modifyCardCost(createCopyInHand(triggeringCard(), { ephemeral: true }), { set: 0 }),
      "untilEndOfTurn",
    )),
  ],
  verifiedText: "1di2qmv2mv1",
});
