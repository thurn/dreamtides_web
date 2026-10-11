import { event, randomIn } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Portal of Twin Paths",
  mtgName: "Collected Company",
  id: "4a8bdcd7-cf88-48d4-80d0-a83fd6617d81",
  renderedText: "Materialize two random ≤2● cost characters from your deck.",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2285036625,
  artOwned: false,
  cardNumber: 415,
  art: { x: 0.504, y: 0.398, scale: 1.17 },
  isStarter: false,
  // RD-hv-umm2.83-1: two different matching deck cards picked at random as it resolves; fewer when fewer match.
  abilities: () => [event(p.materialize(randomIn("deck", 2, { cardType: "character", costAtMost: 2 })))],
  verifiedText: "d16yhy66p0",
});
