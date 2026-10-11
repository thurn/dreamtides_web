import { activated, characterYouControl, energy, returnCost, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Stoneborn Leviathan",
  mtgName: "Wirewood Symbiote",
  id: "07ceb104-0b27-473a-bc72-e6225479ed83",
  renderedText:
    "1●, Return a character you control to hand: Give a character you control +1✦.",
  amplifiedText:
    "1●, Return a character you control to hand: Give a character you control +2✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Ally Audit"],
  imageNumber: 1648927918,
  artOwned: false,
  cardNumber: 502,
  art: { x: 0.378, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [activated([energy(1), returnCost()], p.gainSpark(target(characterYouControl()), variant.amplified ? 2 : 1))],
  verifiedText: "22gmbjoukw5",
});
