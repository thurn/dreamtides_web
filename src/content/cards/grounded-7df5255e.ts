import { card } from "../define";
import { enemyCharacter, event, target, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";

export default card({
  name: "Grounded",
  mtgName: "Prismatic Ending",
  id: "7df5255e-bf23-4c14-b31b-be89fb864ee0",
  renderedText: "Banish an enemy with cost X●.",
  energyCost: null,
  xMinimum: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: [],
  imageNumber: 323698610,
  artOwned: false,
  cardNumber: 433,
  art: { x: 0, y: 0.608, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.banish(target(enemyCharacter({ costAtLeast: x(), costAtMost: x() }))))],
  verifiedText: "hhic0c20tq",
});
