import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ancient Descent",
  mtgName: "Opt",
  id: "3cc9253a-4db6-4b02-92d6-a37805d192fb",
  renderedText: "Foresee 1. Draw a card.",
  amplifiedText: "Foresee 2. Draw a card.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Cantrips", "Art OK", "Art Owned"],
  imageNumber: 2415692459,
  artOwned: false,
  cardNumber: 225,
  art: { x: 0, y: 0.5, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(p.sequence(p.foresee(variant.amplified ? 2 : 1), p.draw(1)))],
  verifiedText: "1ba5mgkn2c3",
});
