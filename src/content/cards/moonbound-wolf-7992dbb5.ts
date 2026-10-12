import { activated, characterYouControl, exhaustSelf, keyword, ofSubtype, returnCost, target } from "../../engine/dsl/builders";
import { triggerAbility } from "../../engine/effects/primitives/trigger-ability";
import { card } from "../define";

export default card({
  name: "Moonbound Wolf",
  mtgName: "Wirewood Symbiote",
  id: "7992dbb5-ca45-4066-aca3-ff1d6d87619e",
  renderedText:
    "Awakened\n\n☾, Return a character you control to hand: Trigger the 'Dawn' ability of a spirit animal you control.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Ally Audit"],
  imageNumber: 2216124457,
  artOwned: false,
  cardNumber: 106,
  isStarter: false,
  abilities: () => [
    keyword("awakened"),
    activated([exhaustSelf(), returnCost()], triggerAbility(target(characterYouControl(ofSubtype("Spirit Animal"))), "dawn")),
  ],
  verifiedText: "23zegs54krw",
});
