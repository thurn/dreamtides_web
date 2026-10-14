import { abandonCost, activated, countersCost } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainPoints, storeCounters } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Twilight Suppressor",
  mtgName: "Blasting Station",
  id: "60feb0d0-89b8-48fc-b01a-ce54e2c9941f",
  renderedText:
    "When you play a character, store 1⧗.\n\n1⧗, Abandon a character: Gain 1⍟.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Character Payoff", "Art Owned"],
  imageNumber: 2293194529,
  artOwned: true,
  cardNumber: 435,
  isStarter: false,
  abilities: () => [
    triggered(whenYouPlay({ cardType: "character" }), storeCounters(1)),
    activated([countersCost(1), abandonCost()], gainPoints(1)),
  ],
  verifiedText: expectedVerifiedText(
    "When you play a character, store 1⧗.\n\n1⧗, Abandon a character: Gain 1⍟.",
  ),
});
