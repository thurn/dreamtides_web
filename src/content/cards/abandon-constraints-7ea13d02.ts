import { abandonCost, additionalCost, choiceCost, discardCost, event } from "../../engine/dsl/builders";
import { draw } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Abandon Constraints",
  mtgName: "Demand Answers",
  id: "7ea13d02-9d97-492e-9edb-f326eb3b4d1c",
  renderedText:
    "To play this card, abandon a character or discard a card. Draw 2 cards.",
  amplifiedText:
    "To play this card, abandon a character or discard a card. Draw 3 cards.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 465449525,
  artOwned: false,
  cardNumber: 214,
  art: { x: 0, y: -0.104, scale: 1 },
  isStarter: false,
  // RD-hv-7x4l.16-2: choose and pay one payable additional-cost alternative.
  abilities: (variant) => [
    additionalCost(choiceCost([abandonCost()], [discardCost()])),
    event(draw(variant.amplified ? 3 : 2)),
  ],
  verifiedText: "1sekcok6uzp",
});
