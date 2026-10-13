import { additionalCost, costPaid, discardCost, enemyCharacter, event, optionalCost, targetWhen } from "../../engine/dsl/builders";
import { dissolve } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Cost of Victory",
  mtgName: "Fatal Push",
  id: "8a971ba7-9dfb-45be-bfbb-bf5e4f11974a",
  renderedText:
    "You may discard a card as an additional cost to play this event. Dissolve a ≤2● cost enemy. If the additional cost was paid, dissolve any enemy instead.",
  amplifiedText:
    "You may discard a card as an additional cost to play this event. Dissolve a ≤3● cost enemy. If the additional cost was paid, dissolve any enemy instead.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Removal", "Art Rework", "Art OK"],
  imageNumber: 2123360840,
  artOwned: true,
  cardNumber: 137,
  art: { x: 0.126, y: 0, scale: 1.17 },
  isStarter: false,
  // RD-hv-umm2.471-1: the retained optional discard selects one enemy's restriction.
  abilities: (variant) => [
    additionalCost(optionalCost(discardCost(1))),
    event(dissolve(targetWhen(costPaid(), enemyCharacter(), enemyCharacter({ costAtMost: variant.amplified ? 3 : 2 })))),
  ],
  verifiedText: "swxktjbfrw",
});
