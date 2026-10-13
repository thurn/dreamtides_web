import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ecliptic Vantage",
  mtgName: "Preordain",
  id: "84fd9c6e-79c6-4b65-878b-1534f3e4b220",
  renderedText: "Foresee 2. Draw a card.",
  amplifiedText: "Foresee 3. Draw a card.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Cantrips"],
  imageNumber: 1042405648,
  artOwned: false,
  cardNumber: 346,
  isStarter: false,
  abilities: (variant) => [event(p.sequence(p.foresee(variant.amplified ? 3 : 2), p.draw(1)))],
  verifiedText: "1es17ylb8nw",
});
