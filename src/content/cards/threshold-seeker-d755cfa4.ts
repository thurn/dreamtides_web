import { activated, discardCost, energy, exhaustSelf } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenDiscard } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Threshold Seeker",
  mtgName: "Conspiracy Theorist",
  id: "d755cfa4-d7c0-46d8-a836-909c45c68890",
  renderedText:
    "2●, ☾, Discard a card: Draw a card.\n\nWhen you discard a card, it gains reclaim.",
  amplifiedText:
    "2●, ☾, Discard a card: Draw 2 cards.\n\nWhen you discard a card, it gains reclaim.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Explorer",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Merfolk Looter", "Art Rework", "Art OK"],
  imageNumber: 2018053211,
  artOwned: false,
  cardNumber: 170,
  isStarter: false,
  abilities: (variant) => [
    activated([energy(2), exhaustSelf(), discardCost()], p.draw(variant.amplified ? 2 : 1)),
    triggered(whenDiscard(), p.grantReclaim(triggeringCard())),
  ],
  verifiedText: "1pjx91pc4hk",
});
