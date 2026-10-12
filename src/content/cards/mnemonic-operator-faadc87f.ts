import { activated, energy, exhaustSelf } from "../../engine/dsl/builders";
import { triggered, whenDiscard } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Mnemonic Operator",
  mtgName: "Glint-Horn Buccaneer",
  id: "faadc87f-98fe-4a58-b1a9-a7c0cff70e08",
  renderedText:
    "2●, ☾: Draw a card, then discard a card.\n\nWhen you discard a card, gain 1⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Score Trigger", "Art Rework", "Art OK"],
  imageNumber: 1926604865,
  artOwned: false,
  cardNumber: 462,
  art: { x: -0.086, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: () => [
    activated([energy(2), exhaustSelf()], p.sequence(p.draw(1), p.discard(1))),
    triggered(whenDiscard(), p.gainPoints(1)),
  ],
  verifiedText: "a15v38miu7",
});
