import { energy, reclaim } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Amber Aurelia",
  mtgName: "Birds of Paradise",
  id: "86fd585b-e9d0-4dc1-bce9-488014b9316d",
  renderedText: "▸Dawn: Gain 1●.\n\nReclaim 3●",
  amplifiedText: "▸Dawn: Gain 2●.\n\nReclaim 3●",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Elves", "Art Owned"],
  imageNumber: 674166508,
  artOwned: false,
  cardNumber: 411,
  art: { x: -0.385, y: 1, scale: 1.47 },
  isStarter: false,
  abilities: (v) => [triggered(onDawn(), p.gainEnergy(v.amplified ? 2 : 1)), reclaim(energy(3))],
  verifiedText: "2778efq4vi0",
});
