import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenScores } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Abyssal Deputy",
  mtgName: "Ingenious Infiltrator",
  id: "cebcd591-dbd6-40b1-813d-f7f01e1b7fdb",
  renderedText:
    "Phasing\n\nWhen an outsider you control scores ⍟, draw a card.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Outsider",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: false,
  spark: 2,
  tags: ["Ninja", "Art Rework", "Art OK", "Ally Audit", "Art Owned"],
  imageNumber: 2212744819,
  artOwned: false,
  cardNumber: 75,
  isStarter: false,
  abilities: () => [p.phasing(), triggered(whenScores(characterYouControl({ subtype: "Outsider" })), p.draw(1))],
  verifiedText: "rq7i6qgnt9",
});
