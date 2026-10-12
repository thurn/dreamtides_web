import { activated, energy, self } from "../../engine/dsl/builders";
import { onDissolved, triggered } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import { draw, gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Tranquil Duelist",
  mtgName: "Marketback Walker",
  id: "fc0c6f10-8864-4660-904a-8e90d261c6ef",
  renderedText:
    "4●: This character gains +1✦.\n\n▸Dissolved: Draw a card for each ✦ this character has.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 1794244549,
  artOwned: false,
  cardNumber: 474,
  art: { x: 0, y: 0, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    activated([energy(4)], gainSpark(self(), 1)),
    // Dissolved reads the effective spark immediately before departure (RD-hv-umm2.460-1).
    triggered(onDissolved(), draw(thisCharacterSpark())),
  ],
  verifiedText: "4n75eo8ul9",
});
