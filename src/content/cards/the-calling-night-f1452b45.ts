import { onDawn, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Calling Night",
  mtgName: "Dark Confidant",
  id: "f1452b45-51dc-453a-916e-88bd9d29e36e",
  renderedText: "▸Dawn: Draw a card. The opponent gains 2⍟.",
  amplifiedText: "▸Dawn: Draw a card. The opponent gains 1⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Owned"],
  imageNumber: 1074377570,
  artOwned: true,
  cardNumber: 243,
  isStarter: false,
  abilities: (v) => [triggered(onDawn(), p.sequence(p.draw(1), p.gainPoints(v.amplified ? 1 : 2, "opponent")))],
  verifiedText: "1ekbicjatrr",
});
