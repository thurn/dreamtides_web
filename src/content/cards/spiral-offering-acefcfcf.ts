import { additionalCost, discardCost, event } from "../../engine/dsl/builders";
import { draw } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Spiral Offering",
  mtgName: "Cathartic Reunion",
  id: "acefcfcf-cba5-46ec-913e-32f1091afbda",
  renderedText: "To play this event, discard 2 cards. Draw 3 cards.",
  amplifiedText: "To play this event, discard 2 cards. Draw 4 cards.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 2155438713,
  artOwned: false,
  cardNumber: 175,
  isStarter: false,
  abilities: (variant) => [additionalCost(discardCost(2)), event(draw(variant.amplified ? 4 : 3))],
  verifiedText: "1nmr0qgcyw8",
});
