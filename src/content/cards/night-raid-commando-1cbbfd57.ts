import { abandonSelfCost, activated } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Night Raid Commando",
  mtgName: "Wizard's Rockets",
  id: "1cbbfd57-f510-4a02-a4b3-f043a4fb99d6",
  renderedText: "Abandon this character: Gain 1●.\n\n▸Dissolved: Draw a card.",
  amplifiedText: "Abandon this character: Gain 2●.\n\n▸Dissolved: Draw a card.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 432001921,
  artOwned: false,
  cardNumber: 399,
  art: { x: 0.025, y: 1, scale: 1.2 },
  isStarter: false,
  abilities: (v) => [activated([abandonSelfCost()], p.gainEnergy(v.amplified ? 2 : 1)), triggered(onDissolved(), p.draw(1))],
  verifiedText: "vizlyf3vkd",
});
