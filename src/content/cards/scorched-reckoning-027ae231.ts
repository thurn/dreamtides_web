import { enemyCharacter, event, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Scorched Reckoning",
  mtgName: "Incinerate",
  id: "027ae231-6569-49bb-866f-7c36ec794a11",
  renderedText: "Dissolve a ≤3✦ enemy.",
  amplifiedText: "Dissolve a ≤4✦ enemy.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Removal"],
  imageNumber: 2182865325,
  artOwned: false,
  cardNumber: 77,
  art: { x: 0.336, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [event(p.dissolve(target(enemyCharacter({ sparkAtMost: v.amplified ? 4 : 3 }))))],
  verifiedText: "231qurrl3c8",
});
