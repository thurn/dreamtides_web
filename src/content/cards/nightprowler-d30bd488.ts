import { abandonSelfCost, activated, energy, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Nightprowler",
  mtgName: "Devoted Druid",
  id: "d30bd488-f921-49cb-a44f-353c54cb6548",
  renderedText: "Abandon this character: Gain 1●.\n\nReclaim 0●",
  amplifiedText: "Abandon this character: Gain 2●.\n\nReclaim 0●",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2251144875,
  artOwned: false,
  cardNumber: 61,
  art: { x: 0.597, y: 1, scale: 1.07 },
  isStarter: false,
  abilities: (v) => [
    activated([abandonSelfCost()], p.gainEnergy(v.amplified ? 2 : 1)),
    reclaim(energy(0)),
  ],
  verifiedText: "uyb6y4dle",
});
