import { triggered, whenScores } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Consumed Berserker",
  mtgName: "Ninja of the Deep Hours",
  id: "071bcab4-ed02-48a0-93dc-8fd0f36611c8",
  renderedText: "Phasing\n\nWhen this character scores ⍟, draw a card.",
  amplifiedText: "Phasing\n\nWhen this character scores ⍟, draw 2 cards.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Outsider",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: 2,
  tags: ["Ninja", "Art Rework", "Art OK"],
  imageNumber: 2433164311,
  artOwned: false,
  cardNumber: 284,
  art: { x: 0, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: (variant) => [p.phasing(), triggered(whenScores(), p.draw(variant.amplified ? 2 : 1))],
  verifiedText: "26imvs8l9l6",
});
