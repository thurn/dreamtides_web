import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sign of Arrival",
  mtgName: "",
  id: "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
  renderedText: "Discover a character.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Starter",
  roles: ["starter-deck"],
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 2603708601,
  artOwned: false,
  cardNumber: 518,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: true,
  abilities: () => [event(p.discover({ cardType: "character" }))],
  verifiedText: "y491632w5m",
});
