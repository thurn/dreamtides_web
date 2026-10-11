import { onDawn, triggered, whenPutIntoVoid } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Annihilator",
  mtgName: "The Gitrog Monster",
  id: "b6bad2a1-b857-4dd7-8b22-050eb68433a5",
  renderedText:
    "▸Dawn: Abandon a character. Erode 1.\n\nWhen a ≤2● cost character is put into your void, draw a card.",
  amplifiedText:
    "▸Dawn: Abandon a character. Erode 2.\n\nWhen a ≤2● cost character is put into your void, draw a card.",
  energyCost: 5,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 8,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 700254508,
  artOwned: false,
  cardNumber: 179,
  art: { x: 0, y: 1, scale: 1.27 },
  isStarter: false,
  abilities: (v) => [
    triggered(onDawn(), p.sequence(p.abandon(), p.erode(v.amplified ? 2 : 1))),
    triggered(whenPutIntoVoid("you", { cardType: "character", costAtMost: 2 }), p.draw(1)),
  ],
  verifiedText: "5fxyx3pog0",
});
