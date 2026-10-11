import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Reset",
  mtgName: "Wheel of Fortune",
  id: "570895fe-cd21-45d2-89ff-162f46978776",
  renderedText: "Each player discards their hand, then draws 6 cards.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1139536448,
  artOwned: false,
  cardNumber: 439,
  art: { x: 0, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [
    event(p.sequence(p.eachPlayer(p.discard({ value: "handSize", player: "you" })), p.eachPlayer(p.draw(6)))),
  ],
  verifiedText: "2de6fh2v1w7",
});
