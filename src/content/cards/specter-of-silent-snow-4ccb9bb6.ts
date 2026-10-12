import { self } from "../../engine/dsl/builders";
import { onDawn, triggered, whenAbandon } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Specter of Silent Snow",
  mtgName: "Korvold, Fae-Cursed King",
  id: "4ccb9bb6-e4db-48c3-a534-b0ab454f0f15",
  renderedText:
    "▸Dawn: Abandon a character.\n\nWhen you abandon a character, draw a card and this character gains +1✦.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: [],
  imageNumber: 529374445,
  artOwned: false,
  cardNumber: 350,
  art: { x: -0.105, y: -0.654, scale: 1.57 },
  isStarter: false,
  abilities: () => [
    triggered(onDawn(), p.abandon()),
    triggered(whenAbandon("you", { cardType: "character" }), p.sequence(p.draw(1), p.gainSpark(self(), 1))),
  ],
  verifiedText: "wodwrp45o9",
});
