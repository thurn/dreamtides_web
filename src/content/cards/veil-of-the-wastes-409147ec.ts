import { characterYouControl, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materialize } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Veil of the Wastes",
  mtgName: "Bloodghast",
  id: "409147ec-d959-4f66-b126-564702e2cd4a",
  renderedText:
    "When you materialize a ≤2● cost character, return this card from your void to play.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 789291004,
  artOwned: false,
  cardNumber: 482,
  isStarter: false,
  abilities: () => [
    triggered(whenMaterialize(characterYouControl({ costAtMost: 2 })), materialize(thisCardIn("void")), { zone: "void" }),
  ],
  verifiedText: expectedVerifiedText("When you materialize a ≤2● cost character, return this card from your void to play."),
});
