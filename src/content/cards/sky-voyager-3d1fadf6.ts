import { self, staticAbility } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy, giveAllTypes } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sky Voyager",
  mtgName: "Masked Vandal",
  id: "3d1fadf6-42e5-4d03-9a72-9bc25968c2b9",
  renderedText: "This character has all character types.\n\n▸Dawn: Gain 1●.",
  amplifiedText: "This character has all character types.\n\n▸Dawn: Gain 2●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Universal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Elves"],
  imageNumber: 2544257347,
  artOwned: false,
  cardNumber: 159,
  art: { x: -0.252, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    staticAbility(giveAllTypes(self())),
    triggered(onDawn(), gainEnergy(variant.amplified ? 2 : 1)),
  ],
  verifiedText: expectedVerifiedText(
    "This character has all character types.\n\n▸Dawn: Gain 1●.",
    "This character has all character types.\n\n▸Dawn: Gain 2●.",
  ),
});
