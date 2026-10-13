import { conditionCardCounts, event, fromVoid, thisCardIn } from "../../engine/dsl/builders";
import { atStartOfTurn, sourceIn, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Whisper of the Past",
  mtgName: "Darkblast",
  id: "5931e388-1856-4e5a-85f8-a5aa34f867b1",
  renderedText:
    "Choose an event in your void to gain reclaim.\n\nAt the start of your turn, if this card is in your void, you may erode 3 to place this card on top of your deck.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 2186149269,
  artOwned: false,
  cardNumber: 283,
  art: { x: 0.168, y: 0, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    event(p.grantReclaim(fromVoid({ cardType: "event" }))),
    triggered(
      atStartOfTurn(),
      p.ifThen(
        conditionCardCounts("deck", 3),
        p.optional(p.sequence(p.erode(3), p.putInDeck([thisCardIn("void")], "top"))),
      ),
      { zone: "void", condition: sourceIn("void") },
    ),
  ],
  verifiedText: "1xfkxdzlmay",
});
