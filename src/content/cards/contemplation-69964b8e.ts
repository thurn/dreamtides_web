import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Contemplation",
  mtgName: "",
  id: "69964b8e-0f38-4fb7-a0cd-89430ef04c2d",
  renderedText: "Draw a card.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Special",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 2633345429,
  artOwned: false,
  cardNumber: 10003,
  isStarter: false,
  abilities: () => [event(p.draw(1))],
  verifiedText: "17a8eqw0wx0",
});
