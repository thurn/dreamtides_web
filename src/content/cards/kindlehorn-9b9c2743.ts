import { activated, energy, exhaustSelf, self } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { gainEnergy, gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Kindlehorn",
  mtgName: "Noble Hierarch",
  id: "9b9c2743-75b3-499d-b5fb-c3429c92d420",
  renderedText: "▸Dawn: Gain 1●.\n\n4●, ☾: This character gains +1✦.",
  amplifiedText: "▸Dawn: Gain 2●.\n\n4●, ☾: This character gains +1✦.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Elves", "Art Rework", "Art OK"],
  imageNumber: 1196004046,
  artOwned: false,
  cardNumber: 4,
  art: { x: -0.056, y: 1, scale: 1.67 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onDawn(), gainEnergy(variant.amplified ? 2 : 1)),
    activated([energy(4), exhaustSelf()], gainSpark(self(), 1)),
  ],
  verifiedText: "e2dkdccgzw",
});
