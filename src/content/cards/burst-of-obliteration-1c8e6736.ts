import { enemyCharacter, event, target, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Burst of Obliteration",
  mtgName: "Banefire",
  id: "1c8e6736-13d6-42d1-8668-46f422fec11e",
  renderedText: "Choose one: Gain X⍟ or dissolve an enemy with X✦.",
  energyCost: null,
  xMinimum: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Removal"],
  imageNumber: 2299755789,
  artOwned: false,
  cardNumber: 131,
  isStarter: false,
  abilities: () => [event(p.chooseOne(p.gainPoints(x()), p.dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() })))))],
  verifiedText: "1s7kdtrb90y",
});
