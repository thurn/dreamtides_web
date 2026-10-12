import { keyword, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenPlayFromVoid } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Graywatch",
  mtgName: "Poxwalkers",
  id: "3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1",
  renderedText:
    "Vengeful\n\nWhen you play a card from your void, return this character to play.",
  amplifiedText:
    "Vengeful\n\nWhen you play a card from your void, return this character to play with awakened.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2218612335,
  artOwned: false,
  cardNumber: 6,
  art: { x: -0.129, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    keyword("vengeful"),
    // "With awakened": it enters ready, only when this effect returns it (RD-hv-umm2.93-2).
    triggered(whenPlayFromVoid(), p.materialize(thisCardIn("void"), { awakened: variant.amplified }), { zone: "void" }),
  ],
  verifiedText: "p8yqonty0i",
});
