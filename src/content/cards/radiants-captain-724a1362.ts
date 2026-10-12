import { activated, energy, exhaustSelf } from "../../engine/dsl/builders";
import { triggered, whenDiscard } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import shadow from "../figments/shadow-86125402";

export default card({
  name: "Radiants' Captain",
  mtgName: "Currency Converter",
  id: "724a1362-3f0f-4b77-b14e-22c0b877349a",
  renderedText:
    "2●, ☾: Draw a card, then discard a card.\n\nOnce per turn, when you discard a card, materialize a 2✦ shadow figment.",
  amplifiedText:
    "2●, ☾: Draw a card, then discard a card.\n\nOnce per turn, when you discard a card, materialize a 3✦ shadow figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art OK"],
  imageNumber: 2189428523,
  artOwned: false,
  cardNumber: 9,
  art: { x: -0.042, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    activated([energy(2), exhaustSelf()], p.sequence(p.draw(1), p.discard(1))),
    triggered(
      whenDiscard(),
      p.materializeFigments(parseFigmentId(shadow.id), 1, { spark: variant.amplified ? 3 : 2 }),
      { oncePerTurn: true },
    ),
  ],
  verifiedText: "1gi89pmel0t",
});
