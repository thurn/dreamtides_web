import { keyword, self, thisCardIn } from "../../engine/dsl/builders";
import { sourceIn, triggered, whenPlayFromVoid } from "../../engine/dsl/triggers";
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
    triggered(
      whenPlayFromVoid(),
      // "With awakened": it is awakened as it returns, and only if this effect returned it (RD-hv-umm2.93-2).
      variant.amplified
        ? p.ifThen(sourceIn("void"), p.sequence(p.materialize(thisCardIn("void")), p.awaken(self())))
        : p.materialize(thisCardIn("void")),
      { zone: "void" },
    ),
  ],
  verifiedText: "p8yqonty0i",
});
