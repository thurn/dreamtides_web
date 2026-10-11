import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Vigil Keeper",
  mtgName: "Undead Augur",
  id: "f68774ce-0e94-489f-90a5-68e03a549ff6",
  renderedText: "When a survivor you control is dissolved, draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "Ally Audit", "Art Owned"],
  imageNumber: 1044240499,
  artOwned: false,
  cardNumber: 205,
  art: { x: 0.096, y: -0.06, scale: 1.37 },
  isStarter: false,
  abilities: () => [triggered(whenDissolved(characterYouControl({ subtype: "Survivor" })), p.draw(1))],
  verifiedText: "1fas54m5u1z",
});
