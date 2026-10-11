import { event, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenDiscardSelf } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Seek Answers",
  mtgName: "Gamble",
  id: "8f69312f-4bec-4671-99da-e752ec6d4cbc",
  renderedText:
    "Draw 2 cards, then discard a card.\n\nWhen you discard this card, it gains reclaim.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1798514902,
  artOwned: false,
  cardNumber: 505,
  art: { x: -0.21, y: 0.242, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    event(p.sequence(p.draw(2), p.discard(1))),
    triggered(whenDiscardSelf(), p.grantReclaim(thisCardIn("void")), { zone: "void" }),
  ],
  verifiedText: "1sd8napbutq",
});
