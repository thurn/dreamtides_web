import { abandonCost, activated, characterYouControl, exhaustSelf, ofSubtype, self } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainPoints, gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ruthless Conqueror",
  mtgName: "Oni-Cult Anvil",
  id: "d6ec65a2-d61e-4617-bdd0-75d5573c063d",
  renderedText:
    "When a warrior you control is dissolved, this character gains +1✦.\n\n☾, Abandon a warrior: Gain 1⍟.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Ally Audit", "Art Owned"],
  imageNumber: 1891048570,
  artOwned: false,
  cardNumber: 172,
  art: { x: 0.064, y: 0, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    triggered(whenDissolved(characterYouControl(ofSubtype("Warrior"))), gainSpark(self(), 1)),
    activated([exhaustSelf(), abandonCost(ofSubtype("Warrior"))], gainPoints(1)),
  ],
  verifiedText: expectedVerifiedText("When a warrior you control is dissolved, this character gains +1✦.\n\n☾, Abandon a warrior: Gain 1⍟."),
});
