import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Glimpse of What Was",
  mtgName: "",
  id: "2162742c-09d0-4e62-ae49-0f8f79b45adc",
  renderedText: "Draw a card, then foresee 1.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Starter",
  roles: ["starter-deck"],
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 2633345429,
  artOwned: false,
  cardNumber: 517,
  art: { x: -0.336, y: 0.839, scale: 1.17 },
  isStarter: true,
  abilities: () => [event(p.sequence(p.draw(1), p.foresee(1)))],
  verifiedText: "1vek3bu2vtr",
});
