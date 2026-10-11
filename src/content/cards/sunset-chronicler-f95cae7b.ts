import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sunset Chronicler",
  mtgName: "Fecundity",
  id: "f95cae7b-6502-4dbe-ae26-16853959d9a3",
  renderedText: "When a character you control is dissolved, draw a card.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 691496698,
  artOwned: false,
  cardNumber: 306,
  isStarter: false,
  abilities: () => [triggered(whenDissolved(characterYouControl()), p.draw(1))],
  verifiedText: "nx897vkrvc",
});
