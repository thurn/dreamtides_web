import { onDawn, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Flamboyant Flamingo",
  mtgName: "Elvish Mystic",
  id: "48257e3e-9600-4edf-a905-e73a41ab5ec1",
  renderedText: "▸Dawn: Gain 1●.",
  amplifiedText: "▸Dawn: Gain 2●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Elves", "Art Rework", "Art OK"],
  imageNumber: 662452981,
  artOwned: true,
  cardNumber: 364,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [triggered(onDawn(), p.gainEnergy(v.amplified ? 2 : 1))],
  verifiedText: "1a56ifvq98n",
});
