import { energy, event, reclaim, sourceWasReclaimed } from "../../engine/dsl/builders";
import { gainPoints, ifThen } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Secrets of the Deep",
  mtgName: "Chain Lightning",
  id: "6f0b709d-0f57-46de-bfba-6a8b4df2b991",
  renderedText:
    "Gain 3⍟. If you reclaimed this card, gain 6⍟ instead.\n\nReclaim 4●",
  amplifiedText:
    "Gain 4⍟. If you reclaimed this card, gain 8⍟ instead.\n\nReclaim 4●",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 2131591273,
  artOwned: false,
  cardNumber: 239,
  isStarter: false,
  // RD-hv-umm2.373-1: the condition reads this card's own actual Reclaim play.
  abilities: (variant) => [
    event(ifThen(sourceWasReclaimed(), gainPoints(variant.amplified ? 8 : 6), gainPoints(variant.amplified ? 4 : 3))),
    reclaim(energy(4)),
  ],
  verifiedText: "1s7k4blnjo5",
});
