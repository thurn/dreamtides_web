import { abandonCost, activated, countersCost } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Soulbinder",
  mtgName: "Mons's Goblin Waiters",
  id: "33874387-2490-48ed-93bc-a47a16e399ad",
  renderedText: "Abandon a character: Store 1⧗.\n\n2⧗: Gain 1●.",
  amplifiedText: "Abandon a character: Store 2⧗.\n\n2⧗: Gain 1●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Free Sacrifice"],
  imageNumber: 2438838891,
  artOwned: false,
  cardNumber: 419,
  art: { x: -0.353, y: 0, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    activated([abandonCost()], p.storeCounters(variant.amplified ? 2 : 1)),
    activated([countersCost(2)], p.gainEnergy(1)),
  ],
  verifiedText: "17sglv2ix8c",
});
