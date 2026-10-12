import { abandonCost, activated } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Exiles of the Last Light",
  mtgName: "Warren Soultrader",
  id: "b56b3411-50c7-4cc9-90e0-d4ffcaec73c6",
  renderedText: "Abandon another character: Gain 1●. The opponent gains 1⍟.",
  amplifiedText: "Abandon another character: Gain 2●. The opponent gains 1⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Free Sacrifice"],
  imageNumber: 457875892,
  artOwned: false,
  cardNumber: 192,
  art: { x: -0.414, y: 0.3, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [activated([abandonCost({ another: true })], p.sequence(p.gainEnergy(v.amplified ? 2 : 1), p.gainPoints(1, "opponent")))],
  verifiedText: "1ez1ydn2d2s",
});
