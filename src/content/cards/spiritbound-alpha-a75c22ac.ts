import { activated, all, characterYouControl, energy, ofSubtype } from "../../engine/dsl/builders";
import { untilEndOfTurn } from "../../engine/dsl/triggers";
import { gainSpark, grant, sequence } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Spiritbound Alpha",
  mtgName: "Elvish Warmaster",
  id: "a75c22ac-e343-4757-964e-a0bb981b5a28",
  renderedText:
    "❖ – 5●: Spirit animals you control gain +3✦ and vengeful until end of turn.",
  amplifiedText:
    "❖ – 5●: Spirit animals you control gain +4✦ and vengeful until end of turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["Ally Audit", "Art Owned"],
  imageNumber: 1727859040,
  artOwned: false,
  cardNumber: 181,
  art: { x: 0.294, y: 1, scale: 1.17 },
  isStarter: false,
  verifiedText: "j67uz9hrwd",
  abilities: (variant) => [
    activated([energy(5)], sequence(
      gainSpark(all(characterYouControl(ofSubtype("Spirit Animal"))), variant.amplified ? 4 : 3, untilEndOfTurn()),
      grant(all(characterYouControl(ofSubtype("Spirit Animal"))), "vengeful", untilEndOfTurn()),
    ), { speed: "fast" }),
  ],
});
