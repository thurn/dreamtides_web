import { characterYouControl, target } from "../../engine/dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenReturn } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ferryman of the Falls",
  mtgName: "Shrieking Drake",
  id: "ad76c77a-e456-4e59-bbf7-6bcb56f892ee",
  renderedText:
    "▸Materialized: Return a character you control to hand.\n\nWhen you return another character to your hand, reduce its cost by 1●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["ETB Bounce", "Art Rework", "Art Duplicate", "Art OK", "Ally Audit"],
  imageNumber: 511427716,
  artOwned: false,
  cardNumber: 445,
  art: { x: -0.285, y: 0.608, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    triggered(onMaterialized(), p.returnToHand(target(characterYouControl()))),
    triggered(whenReturn(characterYouControl({ another: true }), { toYourHand: true }), p.changeCardCost(triggeringCard(), { reduce: 1 })),
  ],
  verifiedText: "1smg5nr2zhj",
});
