import { activated, all, characterYouControl, energy, self, staticAbility } from "../../engine/dsl/builders";
import { untilEndOfTurn } from "../../engine/dsl/triggers";
import { giveAllTypes } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Boundless Wanderer",
  mtgName: "Mirror Entity",
  id: "7fb4b7f5-0dfc-4151-8a88-82f822960b61",
  renderedText:
    "This character has all character types.\n\n1●: Characters you control have all character types until end of turn.",
  energyCost: 1,
  cardType: "Character",
  subtype: "*",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Ally Audit", "Art Owned"],
  imageNumber: 2191235661,
  artOwned: false,
  cardNumber: 427,
  isStarter: false,
  abilities: () => [
    staticAbility(giveAllTypes(self())),
    activated([energy(1)], giveAllTypes(all(characterYouControl()), untilEndOfTurn())),
  ],
  verifiedText: "1vubnjddzjr",
});
