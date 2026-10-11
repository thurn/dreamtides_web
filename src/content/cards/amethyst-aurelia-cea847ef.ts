import { keyword } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Amethyst Aurelia",
  mtgName: "Avacyn's Pilgrim",
  id: "cea847ef-2d1f-45d2-a0e0-fe9ce3fec55c",
  renderedText: "Veil\n\n▸Dawn: Gain 1●.",
  amplifiedText: "Veil\n\n▸Dawn: Gain 2●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Elves", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 432001513,
  artOwned: false,
  cardNumber: 99,
  art: { x: 0, y: 0.266, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [keyword("veil"), triggered(onDawn(), p.gainEnergy(v.amplified ? 2 : 1))],
  verifiedText: "2d9o762vlwp",
});
